// Pipeline de uma notificação do Android: dedup -> parser -> registro -> aviso/pergunta.
import crypto from 'node:crypto';
import { db } from './db.js';
import { interpretarNotificacao } from './parser.js';
import * as tx from './transacoes.js';
import * as contas from './contas.js';
import * as perguntas from './perguntas.js';
import * as ia from './ia.js';
import { calcularSobra } from './resumos.js';
import { enviar } from './saida.js';
import { log } from './log.js';
import { agoraLocal, fmtBRL } from './util.js';

export const JANELA_DEDUP_MS = 2 * 60 * 1000;
const ROTULO = {
  pix_enviado: 'Pix', transferencia_enviada: 'transferência', boleto: 'pagamento de boleto',
  pix_recebido: 'Pix', transferencia_recebida: 'transferência', compra_cartao: 'compra', debito: 'compra no débito',
};

export function hashNotificacao({ app, titulo, texto }) {
  return crypto.createHash('sha256').update(`${app}\u0001${titulo}\u0001${texto}`).digest('hex');
}

/**
 * Deduplicação: mesma (app + título + texto) dentro de 2 minutos = repetição do Android.
 * Guardamos o horário da 1ª ocorrência; depois da janela, a mesma notificação conta de novo
 * (ex.: dois Pix idênticos em momentos diferentes).
 */
export function jaVista(hash, agoraMs = Date.now()) {
  const r = db().prepare('SELECT visto_ms FROM notificacoes_vistas WHERE hash = ?').get(hash);
  if (r && agoraMs - r.visto_ms < JANELA_DEDUP_MS) return true;
  db().prepare(`INSERT INTO notificacoes_vistas (hash, visto_ms) VALUES (?, ?)
    ON CONFLICT(hash) DO UPDATE SET visto_ms = excluded.visto_ms`).run(hash, agoraMs);
  return false;
}

function limpar(v, max = 2000) {
  return String(v ?? '').slice(0, max);
}

export async function decidirCategoria(texto) {
  const local = tx.categorizarLocal(texto);
  if (local.confianca >= 0.8) return local;
  const g = ia.disponivel() ? await ia.categorizar(texto) : null;
  return g || { categoria: 'outros', confianca: 0 };
}

async function perguntar(texto, dadosPergunta) {
  const msgId = await enviar(texto);
  perguntas.criar({ ...dadosPergunta, msgId });
}

export async function processarNotificacao(body, { agoraMs = Date.now() } = {}) {
  const n = { app: limpar(body?.app, 200), titulo: limpar(body?.titulo), texto: limpar(body?.texto) };
  if (!n.app || (!n.titulo && !n.texto)) return { status: 'invalida' };

  const hash = hashNotificacao(n);
  if (jaVista(hash, agoraMs)) {
    log.debug('Notificação duplicada descartada.');
    return { status: 'duplicada' };
  }

  const r = await interpretarNotificacao(n);
  if (r.ignorar) {
    log.info(`Notificação ignorada (${r.motivo}).`);   // sem o texto, por privacidade
    return { status: 'ignorada', motivo: r.motivo };
  }
  log.info(`Notificação: ${r.tipo} ${fmtBRL(r.valor)} via ${r.via} (${r.app})`);

  const hoje = agoraLocal(new Date(agoraMs));
  const base = { tipo: r.tipo, valor: r.valor, contraparte: r.contraparte, origemApp: r.app, hash };

  // ------------------------------------------------------------- entradas
  if (tx.ehEntrada(r.tipo)) {
    const semOrigem = !r.contraparte;
    const id = tx.registrar({ ...base, categoria: 'entrada', status: semOrigem ? 'pendente' : 'ok' });
    if (semOrigem) {
      const texto = `Entrou ${fmtBRL(r.valor)} aqui, mas não vi de quem. De onde veio?`;
      await perguntar(texto, { tipo: 'origem', transacaoId: id });
      return { status: 'registrada', id, mensagem: texto, pergunta: 'origem' };
    }
    const fallback = `Entrou ${fmtBRL(r.valor)} de ${r.contraparte}! Bem-vindo, dinheirinho 🤑`;
    const msg = await ia.voz({
      situacao: 'Acabou de entrar dinheiro (Pix/transferência recebida). Comemore com humor.',
      valores: { valor: r.valor }, obrigatorios: ['valor'], extras: { de_quem: r.contraparte }, fallback,
    });
    await enviar(msg);
    return { status: 'registrada', id, mensagem: msg };
  }

  // --------------------------------------------- saídas: baixa de conta fixa
  const casou = contas.casarComConta({ contraparte: r.contraparte, valor: r.valor }, hoje);

  if (casou?.nivel === 'forte') {
    const p = casou.pagamento;
    const id = tx.registrar({ ...base, categoria: 'contas', descricao: p.nome, status: 'ok' });
    contas.marcarPaga(p.id, { valor: r.valor, dataIso: hoje.iso, transacaoId: id });
    const texto = `Parece que a conta *${p.nome}* foi paga (${fmtBRL(r.valor)}), marquei aqui. Certo? (responde *sim* ou *não*)`;
    await perguntar(texto, { tipo: 'baixa_feita', transacaoId: id, pagamentoId: p.id });
    return { status: 'registrada', id, baixa: 'automatica', mensagem: texto };
  }

  if (casou?.nivel === 'incerto') {
    const p = casou.pagamento;
    const id = tx.registrar({ ...base, status: 'pendente' });
    const quem = r.contraparte ? ` pra ${r.contraparte}` : '';
    const texto = `Vi ${r.tipo === 'compra_cartao' ? 'uma compra' : `um ${ROTULO[r.tipo]}`} de ${fmtBRL(r.valor)}${quem}. Isso é a conta *${p.nome}* (${fmtBRL(p.valor_previsto)})? (*sim* ou *não*)`;
    await perguntar(texto, { tipo: 'baixa_incerta', transacaoId: id, pagamentoId: p.id });
    return { status: 'registrada', id, baixa: 'incerta', mensagem: texto };
  }

  // ----------------------------------------------- saídas: Pix/boleto => pergunta
  if (['pix_enviado', 'transferencia_enviada', 'boleto'].includes(r.tipo)) {
    const id = tx.registrar({ ...base, status: 'pendente' });
    const quem = r.contraparte ? ` pra ${r.contraparte}` : '';
    const texto = `Vi ${r.tipo === 'boleto' ? 'um pagamento de boleto' : `um ${ROTULO[r.tipo]}`} de ${fmtBRL(r.valor)}${quem}. Foi pra quê? (ou *pula*)`;
    await perguntar(texto, { tipo: 'categoria', transacaoId: id });
    return { status: 'registrada', id, pergunta: 'categoria', mensagem: texto };
  }

  // ------------------------------------- saídas: cartão/débito => categoriza sozinho
  const cat = await decidirCategoria(r.contraparte || '');
  if (!r.contraparte || cat.confianca < 0.6) {
    const id = tx.registrar({ ...base, status: 'pendente' });
    const onde = r.contraparte ? ` em ${r.contraparte}` : '';
    const texto = `Gastei ${fmtBRL(r.valor)}${onde}, mas não sei em que categoria encaixar. Que categoria é? (ou *pula*)`;
    await perguntar(texto, { tipo: 'categoria', transacaoId: id });
    return { status: 'registrada', id, pergunta: 'categoria', mensagem: texto };
  }

  const id = tx.registrar({ ...base, categoria: cat.categoria, status: 'ok' });
  const msg = await avisoGasto({ valor: r.valor, onde: r.contraparte, categoria: cat.categoria, hoje });
  const alerta = tx.verificarOrcamento(cat.categoria, hoje.ano, hoje.mes);
  await enviar(alerta ? `${msg}\n\n${alerta}` : msg);
  return { status: 'registrada', id, categoria: cat.categoria, mensagem: msg, alerta };
}

/** Mensagem "saiu X em Y" na voz do dinheiro (usada também para gastos digitados). */
export async function avisoGasto({ valor, onde, categoria, hoje = agoraLocal() }) {
  const s = calcularSobra(hoje);
  const valores = { valor };
  if (s.sobra != null && s.sobra > 0) valores.sobra = s.sobra;
  const fallback = `Saiu ${fmtBRL(valor)}${onde ? ` em ${onde}` : ''} (${categoria}). Anotado! 💸${valores.sobra ? ` Ainda tenho ${fmtBRL(s.sobra)} pra gente chegar no fim do mês.` : ''}`;
  return ia.voz({
    situacao: 'Acabou de sair dinheiro numa compra. Avise com humor sincero; se houver "sobra", diga quanto ainda resta pro fim do mês.',
    valores, obrigatorios: ['valor'], extras: { estabelecimento: onde || '(não informado)', categoria }, fallback,
  });
}


import test from 'node:test';
import assert from 'node:assert/strict';
import { processarNotificacao, hashNotificacao, JANELA_DEDUP_MS } from '../src/notificacoes.js';
import { db } from '../src/db.js';
import { preparar, NU } from './helpers.js';

const notif = { app: NU, titulo: 'Transferência recebida', texto: 'Você recebeu uma transferência de João Souza no valor de R$ 300,00.' };

test('hash é estável e depende de app+título+texto', () => {
  assert.equal(hashNotificacao(notif), hashNotificacao({ ...notif }));
  assert.notEqual(hashNotificacao(notif), hashNotificacao({ ...notif, texto: 'outro' }));
});

test('notificação repetida dentro de 2 minutos é descartada; depois da janela conta de novo', async () => {
  const enviadas = preparar();
  const t0 = Date.now();
  assert.equal((await processarNotificacao(notif, { agoraMs: t0 })).status, 'registrada');
  assert.equal((await processarNotificacao(notif, { agoraMs: t0 + 30_000 })).status, 'duplicada');
  assert.equal((await processarNotificacao(notif, { agoraMs: t0 + JANELA_DEDUP_MS - 1000 })).status, 'duplicada');
  assert.equal((await processarNotificacao(notif, { agoraMs: t0 + JANELA_DEDUP_MS + 1000 })).status, 'registrada');
  assert.equal(db().prepare('SELECT COUNT(*) n FROM transacoes').get().n, 2);
  assert.equal(enviadas.length, 2);
});

test('valores são guardados como inteiros (centavos)', async () => {
  preparar();
  await processarNotificacao(notif);
  const t = db().prepare('SELECT valor FROM transacoes').get();
  assert.equal(t.valor, 30000);
  assert.ok(Number.isInteger(t.valor));
});

test('notificações inválidas e promoções não geram transação', async () => {
  const enviadas = preparar();
  assert.equal((await processarNotificacao({ app: NU })).status, 'invalida');
  assert.equal((await processarNotificacao({ app: NU, titulo: 'Ganhe R$ 50', texto: 'Aproveite nossa oferta!' })).status, 'ignorada');
  assert.equal(enviadas.length, 0);
});

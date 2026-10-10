# Guia para quem não é de programação

Siga na ordem. Cada passo diz o que clicar. Se travar em qualquer um, me diga em qual número você parou e o que apareceu na tela.

## O que é cada peça
- **O bot (Dinheiro Fala)**: um programa que fica ligado 24h num computador e conversa com você no WhatsApp.
- **O app do celular (Caçador de Notificações)**: lê as notificações dos seus bancos e (1) guarda os textos para você me mandar e (2) envia cada uma para o bot.
- **O Gemini**: a inteligência do Google que dá a "voz" do dinheiro. É grátis.

## Passo 1: pegar a chave do Gemini (2 minutos)
1. No computador ou celular, abra **https://aistudio.google.com/apikey**
2. Entre com sua conta Google (a mesma do Gmail).
3. Aceite os termos se aparecerem.
4. Clique em **"Criar chave de API"** (*Create API key*). Se perguntar o projeto, escolha **"Criar chave em novo projeto"**.
5. Aparece um texto comprido: é a sua chave. Toque em **copiar**.
6. **Trate como uma senha**: não poste em conversa nem em redes sociais. Se vazar, apague a chave nessa mesma página e crie outra.

Ela só será colada num arquivo chamado `.env`, no computador do bot (Passo 5).

## Passo 2: instalar o app no celular
1. Baixe o arquivo `apk/Cacador-de-Notificacoes.apk` (pelo GitHub no celular, ou na aba **Releases** do repositório).
2. Abra o arquivo baixado. O Android vai pedir para **permitir instalar apps desta origem**: permita.
3. Abra o app **Caçador de Notificações** e toque em **"Abrir tela de acesso às notificações"**. Ache o app na lista e **ative**.
4. **Se a opção estiver cinza/bloqueada** (acontece no Android 13+ com apps instalados por arquivo): volte ao app, toque em **"Se a opção estiver bloqueada: abrir Info do app"**, toque nos **três pontinhos (⋮)** no canto de cima e em **"Permitir configurações restritas"**. Depois repita o passo 3.
5. Toque em **"Bateria: deixar sem restrição"** e escolha **"Não otimizar"** para o app. Sem isso o Android pode "matar" o app.
6. Em celulares Xiaomi, Samsung, Motorola, etc., ative também "Início automático" e "Bloquear no multitarefa" para o app.
7. Confira na tela do seu banco/Android que as **notificações mostram o valor** (não escondem o conteúdo na tela de bloqueio).

## Passo 3: coletar os textos reais dos bancos (para você me mandar)
1. Deixe o app instalado alguns dias, **ou** faça pequenas operações de teste (um Pix de R$ 1,00 para você mesmo, uma compra pequena no cartão).
2. Abra o app: as notificações aparecem na lista ("4. Capturas"). CPF, CNPJ, e-mails e números longos já saem escondidos.
3. Toque em **"Compartilhar / copiar para me mandar"**. O texto já fica copiado.
4. **Cole aqui na conversa comigo.** Eu ajusto o programa para ler exatamente os seus bancos.
5. Se algum banco seu **não aparecer**, desmarque **"Só apps de banco/carteira conhecidos"**, faça uma operação nesse banco, e me mande: eu descubro o nome técnico do app.

Antes de colar, dê uma olhada: se tiver algum dado seu que você não queira expor (nome de pessoa, por exemplo), pode trocar por "FULANO". O que importa é o formato da frase.

## Passo 4: o bot precisa ficar ligado 24h
Escolha **uma** opção:
- **Recomendado: Oracle Cloud Free Tier** (computador grátis na internet). É o mais estável. O passo a passo está no `README.md`, seção 6. **Eu te guio, comando por comando, aqui na conversa.**
- Um computador seu que fique ligado sempre (ou um Raspberry Pi).

## Passo 5: ligar tudo
1. No computador do bot, copie o arquivo `.env.example` para `.env` e preencha: `GEMINI_API_KEY` (Passo 1), `WEBHOOK_TOKEN` (uma senha inventada, grande), `MEU_NUMERO` (seu número com 55 + DDD, só números) e `MODO_CHAT`.
2. Ligue o bot, escaneie o QR Code com o WhatsApp (README seção 3) e mande `ajuda`.
3. No app do celular, na parte **"3. Enviar para o bot"**, cole o endereço do seu bot (termina em `/notificacao`) e o mesmo token, marque **"Enviar cada notificação de banco para o bot"** e toque em **"Testar conexão"**. Tem que aparecer "Conexão e token OK".
4. Pronto: a próxima compra no cartão já vira mensagem no WhatsApp.

## Perguntas rápidas

**Se eu usar um chip secundário para o bot, qualquer pessoa que mandar mensagem vira "cliente" do bot?**
Não. O bot só responde ao número que você colocou em `MEU_NUMERO`. Mensagens de qualquer outra pessoa ou grupo são ignoradas, sem resposta nenhuma, e nada delas é salvo. Para essas pessoas é como se o bot não existisse (o WhatsApp do chip continua normal, você só não vê o bot reagir).

**Qual modo escolher: `self` ou `dedicado`?**
`dedicado`, com o chip secundário. Sua conta principal fica protegida (o programa que conecta ao WhatsApp não é oficial, então existe um risco pequeno de bloqueio do número usado) e você recebe notificação de verdade no celular quando o bot fala. Use um WhatsApp (ou WhatsApp Business) instalado nesse chip.

**O bot lê minha senha ou dados do banco?**
Não. Ele só vê o texto das notificações que os bancos mostram na tela.

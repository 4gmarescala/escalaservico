# 🪖 4º GMar — Guia de Instalação e Publicação
## Sistema de Controle de Permutas (Versão Supabase Reativa)

---

## O QUE VOCÊ VAI PRECISAR
- Um computador com acesso à internet (apenas para configurar uma vez)
- Uma conta Supabase (gratuita) — para o Banco de Dados e Realtime
- Uma conta GitHub (gratuita) — para hospedar o código
- Cerca de 15 a 20 minutos

Após a configuração, o sistema fica no ar **24h por dia**, acessível pelo celular de qualquer militar.

---

## PASSO 1 — Criar o Projeto no Supabase

1. Acesse **https://supabase.com** e faça login (ou crie uma conta gratuita com seu GitHub).
2. No painel, clique em **"New Project"**.
3. Escolha uma organização (ou crie uma padrão).
4. Nome do projeto: `gmar4-permutas`
5. Defina uma **Database Password** forte e guarde-a bem.
6. Escolha a região **São Paulo (sa-east-1)** para menor latência.
7. Escolha o plano **Free** e clique em **"Create new project"**.
8. Aguarde alguns minutos até que o banco de dados seja provisionado.

---

## PASSO 2 — Criar as Tabelas e Criptografia (SQL Editor)

1. No menu lateral esquerdo do Supabase, clique em **"SQL Editor"** (ícone com `>_`).
2. Clique em **"+ New query"** (ou "Blank query").
3. Abra o arquivo **`firestore.rules`** que está na pasta do seu projeto e copie todo o seu conteúdo.
4. Cole o conteúdo copiado na área de texto do SQL Editor.
5. Clique no botão **"Run"** (no canto inferior direito da query).
6. Você deverá ver uma mensagem de sucesso: *"Success. No rows returned."*
7. As tabelas, triggers de criptografia de senhas, funções RPC de login e publicação em tempo real (Realtime) foram criadas com sucesso!

---

## PASSO 3 — Criar a Conta do Primeiro Administrador

Para acessar o sistema pela primeira vez como Administrador, você precisa cadastrar um usuário no banco.

1. No mesmo SQL Editor, clique em **"+ New query"** para abrir uma nova aba.
2. Digite a seguinte query para cadastrar o primeiro administrador com RG `0001` e senha `admin123` (você pode alterar estes valores antes de rodar):
   ```sql
   INSERT INTO public.usuarios (role, posto, nome, rg, senha)
   VALUES ('admin', 'Cel', 'ADMINISTRADOR PRINCIPAL', '0001', 'admin123');
   ```
3. Clique em **"Run"**. Pronto! O primeiro administrador está criado. Quando ele fizer login, a senha `'admin123'` será automaticamente criptografada pelo banco usando Blowfish (bcrypt).

---

## PASSO 4 — Obter as Credenciais e Configurar o Front-end

1. No painel do Supabase, clique na engrenagem de configurações ⚙️ (no canto inferior esquerdo) e vá em **"API"**.
2. Na seção **"Project API keys"**, você encontrará:
   * **Project URL**: Uma URL que começa com `https://...`
   * **Anon Public Key**: Uma chave longa que começa com `eyJhbGci...`
3. Abra o arquivo **`src/supabase.js`** na pasta do projeto.
4. Substitua as variáveis `COLE_AQUI_SUA_URL_SUPABASE` e `COLE_AQUI_SUA_ANON_KEY` com os valores correspondentes que você acabou de obter.

---

## PASSO 5 — Publicar no Vercel (hospedagem gratuita)

### 5.1 — Enviar o código para o GitHub
1. Acesse **https://github.com** e crie uma conta gratuita.
2. Clique em **"New repository"** → nome: `gmar-permutas` → **Create**.
3. Na pasta do projeto no seu computador, abra o terminal e execute:
   ```bash
   git init
   git add .
   git commit -m "inicial"
   git branch -M main
   git remote add origin https://github.com/SEU_USUARIO/gmar-permutas.git
   git push -u origin main
   ```

### 5.2 — Conectar ao Vercel
1. Acesse **https://vercel.com** e crie sua conta usando o login do GitHub.
2. Clique em **"New Project"**.
3. Selecione o repositório `gmar-permutas`.
4. Clique em **"Deploy"**.
5. Aguarde cerca de 2 minutos.
6. A Vercel fornecerá um link público como: `https://gmar-permutas.vercel.app`.

**Esse é o link que cada militar vai acessar pelo celular!**

---

## PASSO 6 — Cadastrar os Militares

1. Acesse o sistema com a conta do administrador (ex: RG `0001` e senha `admin123`).
2. Vá na aba **👤 Militares** e role até o formulário **Cadastrar Militar + Acesso**.
3. Preencha os campos obrigatórios (posto, nome, RG, regime, seção e senha inicial).
4. O sistema cria simultaneamente o registro de militar e a credencial criptografada na tabela de usuários.
5. O administrador permanece logado normalmente sem que sua sessão seja alterada!
6. Informe a cada militar: **link do sistema + RG + senha inicial**.

> 💡 **Dica:** Oriente os militares a salvar o link na tela inicial do celular (funciona como se fosse um aplicativo nativo).

---

## COMO O MILITAR FAZ LOGIN

- Acessa o link pelo celular.
- Digita seu **RG** (apenas números).
- Digita a **senha** cadastrada pelo admin.
- O sistema abre instantaneamente na tela dele.

---

## FLUXO DE UMA PERMUTA EM TEMPO REAL

O sistema agora é **100% reativo por natureza**. Se dois celulares estiverem abertos na mesma tela, as atualizações ocorrem instantaneamente em menos de 1 segundo:

```
1. Militar A solicita permuta para o Militar B
   └─ Sistema valida prazo antecedência de 72h
   └─ A permuta aparece IMEDIATAMENTE (tempo real) no celular do Militar B

2. Militar B recebe a notificação e clica em Confirmar
   └─ O card de permuta na tela do Militar A muda de status instantaneamente
   └─ O painel do Administrador acusa nova notificação para aprovação na hora

3. Admin analisa, clica em Aprovar (ou Rejeitar)
   └─ O status final "Aprovada" / "Rejeitada" se propaga na hora para ambos os militares
```

---

## MANUTENÇÃO MENSAL

No início de cada mês:
1. Faça login como admin.
2. Altere o mês de referência (no canto superior direito).
3. Vá em **⚠️ Limites** e ajuste os serviços impostos de cada militar conforme a necessidade do mês. O limite máximo de permutas pagas (50%) é calculado de forma automática.

---

## SUPORTE E PROBLEMAS

| Problema | Solução |
|---|---|
| Militar não consegue logar | Verifique se o RG está correto. Se necessário, o Admin pode atualizar a senha recadastrando o acesso ou via SQL no editor |
| "Permuta bloqueada" | O serviço está a menos de 72h do início ou o limite de permutas mensais do militar foi atingido |
| Dados não aparecem | Verifique se as tabelas foram criadas com sucesso no passo 2 |

---

## CUSTOS

| Serviço | Plano Gratuito |
|---|---|
| Supabase Database & Realtime | Banco de dados PostgreSQL com 500MB + 200 mil mensagens realtime/mês |
| Vercel | Ilimitado para projetos pessoais |

Para o volume de uma unidade militar, **o custo é zero**.

---

*Sistema desenvolvido para o 4º Grupo de Mísseis e Antiaéreo — GSEGV*
*Versão 2.0 (Supabase Reativa) — 2026*

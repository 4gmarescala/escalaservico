// src/pages/Login.js
import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const [rg, setRg] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setErro('');
    setLoading(true);
    try {
      await login(rg, senha);
    } catch (err) {
      setErro('RG ou senha incorretos. Verifique os dados e tente novamente.');
    }
    setLoading(false);
  }

  return (
    <div style={styles.bg}>
      <div style={styles.card}>
        <img src="/heraldica_gmar.png" alt="Logo GMar" style={styles.logoImg} />
        <h1 style={styles.h1}>4º GMar</h1>
        <p style={styles.sub}>SISTEMA DE CONTROLE DE PERMUTAS</p>

        <form onSubmit={handleLogin} style={styles.form}>
          <div style={styles.campo}>
            <label style={styles.label}>RG MILITAR</label>
            <input
              style={styles.input}
              type="text"
              placeholder="Ex: 43842"
              value={rg}
              onChange={e => setRg(e.target.value)}
              required
              autoComplete="username"
            />
          </div>
          <div style={styles.campo}>
            <label style={styles.label}>SENHA</label>
            <input
              style={styles.input}
              type="password"
              placeholder="••••••••"
              value={senha}
              onChange={e => setSenha(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          {erro && <div style={styles.erro}>{erro}</div>}

          <button style={{ ...styles.btn, opacity: loading ? 0.7 : 1 }} type="submit" disabled={loading}>
            {loading ? 'ENTRANDO...' : 'ENTRAR'}
          </button>
        </form>

        <p style={styles.rodape}>Em caso de problemas com acesso, procure a administração.</p>
      </div>
    </div>
  );
}

const C = {
  fundo: '#ffffff', // Vermelho fogo principal CBMERJ
  fundo2: '#8f0000', // Vermelho escuro para o card
  ouro: '#ffffff', // Branco para alto contraste
  ouroClaro: '#f5f6fa',
  creme: '#ffffff',
  cinza: '#f2dcdc', // Branco com tom quente de vermelho suave
  borda: 'rgba(255, 255, 255, 0.25)', // Contornos em branco translúcido
  vermelho: '#ffffff',
  vermelhoClaro: '#ffffff',
};

const styles = {
  bg: {
    minHeight: '100vh',
    background: C.fundo,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1rem',
    backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none'%3E%3Cg fill='%23ffffff' fill-opacity='0.015'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
  },
  card: {
    background: C.fundo2,
    border: `1px solid ${C.borda}`,
    borderRadius: 16,
    padding: '2.5rem 2rem',
    width: '100%',
    maxWidth: 380,
    boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
    textAlign: 'center',
  },
  logoImg: {
    width: 100,
    height: 100,
    objectFit: 'contain',
    margin: '0 auto 1.2rem',
    display: 'block',
    filter: 'drop-shadow(0 0 15px rgba(255,255,255,0.45))',
  },
  h1: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: '2rem',
    letterSpacing: 6,
    color: C.creme,
    margin: 0,
  },
  sub: {
    fontFamily: "'Montserrat', sans-serif",
    fontSize: '0.62rem',
    fontWeight: 700,
    letterSpacing: 3,
    color: C.ouro,
    margin: '0.3rem 0 2rem',
    textTransform: 'uppercase',
  },
  form: { textAlign: 'left' },
  campo: { marginBottom: '1rem' },
  label: {
    display: 'block',
    fontFamily: "'Montserrat', sans-serif",
    fontSize: '0.6rem',
    fontWeight: 700,
    letterSpacing: 2,
    color: C.ouro,
    marginBottom: '0.4rem',
    textTransform: 'uppercase',
  },
  input: {
    width: '100%',
    background: 'rgba(0,0,0,0.25)',
    border: `1px solid ${C.borda}`,
    borderRadius: 8,
    color: C.creme,
    fontFamily: "'Montserrat', sans-serif",
    fontSize: '0.92rem',
    padding: '0.75rem 1rem',
    outline: 'none',
    boxSizing: 'border-box',
  },
  erro: {
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.3)',
    borderRadius: 8,
    color: '#ffffff',
    fontSize: '0.85rem',
    padding: '0.7rem 1rem',
    marginBottom: '1rem',
    textAlign: 'center',
  },
  btn: {
    width: '100%',
    background: C.ouro, // Branco de alto contraste sobre o vermelho escuro
    color: '#8f0000', // Vermelho escuro para o texto do botão
    border: 'none',
    borderRadius: 8,
    fontFamily: "'Montserrat', sans-serif",
    fontSize: '0.8rem',
    fontWeight: 800,
    letterSpacing: 2,
    padding: '0.85rem',
    cursor: 'pointer',
    textTransform: 'uppercase',
    marginTop: '0.5rem',
    boxShadow: `0 4px 15px rgba(255,255,255,0.2)`,
    transition: 'all 0.2s',
  },
  rodape: {
    marginTop: '1.5rem',
    fontSize: '0.72rem',
    color: C.cinza,
    fontStyle: 'italic',
  },
};

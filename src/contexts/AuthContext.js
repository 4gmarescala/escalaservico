// src/contexts/AuthContext.js
import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../supabase';

const AuthContext = createContext();
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);       // Perfil da sessão
  const [perfil, setPerfil] = useState(null);   // Perfil da sessão (compatibilidade)
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Carrega a sessão persistente do localStorage
    try {
      const session = localStorage.getItem('gmar_session');
      if (session) {
        const parsed = JSON.parse(session);
        setUser(parsed);
        setPerfil(parsed);
      }
    } catch (err) {
      console.error('Erro ao ler gmar_session:', err);
    }
    setLoading(false);
  }, []);

  async function login(rg, senha) {
    const { data, error } = await supabase.rpc('login_militar', {
      p_rg: rg.trim(),
      p_senha: senha
    });

    if (error) {
      throw new Error(error.message);
    }

    if (data && data.length > 0) {
      const dbUser = data[0];
      const mappedUser = {
        id: dbUser.id,
        role: dbUser.role,
        milId: dbUser.mil_id,
        posto: dbUser.posto,
        nome: dbUser.nome,
        rg: dbUser.rg
      };
      setUser(mappedUser);
      setPerfil(mappedUser);
      localStorage.setItem('gmar_session', JSON.stringify(mappedUser));
      return mappedUser;
    } else {
      throw new Error('RG ou senha incorretos.');
    }
  }

  async function logout() {
    setUser(null);
    setPerfil(null);
    localStorage.removeItem('gmar_session');
  }

  const isAdmin = perfil?.role === 'admin';
  const isMilitar = perfil?.role === 'militar';

  return (
    <AuthContext.Provider value={{ user, perfil, isAdmin, isMilitar, login, logout, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

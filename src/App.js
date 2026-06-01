// src/App.js
import React from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './pages/Login';
import PortalMilitar from './pages/PortalMilitar';
import PainelAdmin from './pages/PainelAdmin';

function AppRouter() {
  const { user, perfil, loading } = useAuth();

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0a1128', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif' }}>
      <div style={{ textAlign: 'center', color: '#00d2ff', fontFamily: 'monospace', letterSpacing: 3 }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>⚓</div>
        <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#b32c2c', letterSpacing: 4 }}>CBMERJ · GMAR</div>
        <div style={{ fontSize: '0.75rem', marginTop: '0.5rem', color: '#8fa0c0' }}>SISTEMA DE PERMUTAS</div>
      </div>
    </div>
  );

  if (!user || !perfil) return <Login />;
  if (perfil.role === 'admin') return <PainelAdmin />;
  if (perfil.role === 'militar') return <PortalMilitar />;
  return <Login />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}

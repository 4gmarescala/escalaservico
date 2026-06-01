// src/supabase.js
import { createClient } from '@supabase/supabase-js';
import efetivoMock from './services/efetivo_mock.json';

// Substitua com suas credenciais do Supabase obtidas em Settings -> API
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'COLE_AQUI_SUA_URL_SUPABASE';
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || 'COLE_AQUI_SUA_ANON_KEY';

// Deteta se o projeto está sem chaves e altera para o MODO MOCK automaticamente
export const isMockMode = 
  supabaseUrl === 'COLE_AQUI_SUA_URL_SUPABASE' || 
  supabaseAnonKey === 'COLE_AQUI_SUA_ANON_KEY' ||
  !supabaseUrl ||
  !supabaseAnonKey;

// Canais e ouvintes para simulação do Realtime local
export const mockChannels = [];

export const triggerMockEvent = () => {
  mockChannels.forEach(chan => {
    chan.callbacks.forEach(cb => cb());
  });
};

class MockChannel {
  constructor(name) {
    this.name = name;
    this.callbacks = [];
  }
  on(event, filter, callback) {
    this.callbacks.push(callback);
    return this;
  }
  subscribe() {
    mockChannels.push(this);
    return this;
  }
}

// Cliente Mock que simula o Supabase no LocalStorage
const mockSupabase = {
  channel(name) {
    return new MockChannel(name);
  },
  removeChannel(channel) {
    const idx = mockChannels.indexOf(channel);
    if (idx !== -1) mockChannels.splice(idx, 1);
  },
  async rpc(name, args) {
    if (name === 'login_militar') {
      let users = [];
      const localVal = localStorage.getItem('mock_usuarios');
      if (localVal) {
        try {
          users = JSON.parse(localVal);
        } catch (e) {
          users = [];
        }
      }
      
      // Auto-Healing: Mescla os usuários do Excel caso eles não estejam no LocalStorage
      const existingRgs = new Set((users || []).map(u => u.rg));
      let updated = false;

      const excelUsers = efetivoMock.usuarios || [];
      excelUsers.forEach(u => {
        if (!existingRgs.has(u.rg)) {
          users.push(u);
          updated = true;
        }
      });

      // Garante a existência do Administrador de Teste padrão
      if (!users.some(u => u.rg === '0001')) {
        const adminUser = {
          id: 'mock-admin-uid',
          role: 'admin',
          milId: null,
          posto: 'Cel',
          nome: 'ADMINISTRADOR DE TESTE',
          rg: '0001',
          senha: 'admin123'
        };
        users.push(adminUser);
        updated = true;
      }

      if (updated || !localVal) {
        localStorage.setItem('mock_usuarios', JSON.stringify(users));
      }

      // Procura a combinação RG e Senha
      const matched = users.find(u => u.rg === args.p_rg.trim() && u.senha === args.p_senha);
      
      if (matched) {
        return { data: [matched], error: null };
      }
      
      return { data: [], error: null };
    }
    return { data: null, error: { message: 'Função RPC não mapeada no mock.' } };
  }
};

let supabaseClient;
if (!isMockMode) {
  supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
} else {
  supabaseClient = mockSupabase;
  console.log('⚓ [4º GMar] Rodando em MODO MOCK LOCAL (sem chaves do Supabase). Os dados serão persistidos no LocalStorage do seu navegador!');
}

export const supabase = supabaseClient;
export default supabase;

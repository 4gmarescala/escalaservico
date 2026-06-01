// src/services/firestore.js
// ⚓ 4º GMar — CAMADA DE DADOS E CONEXÃO SUPABASE
// Adaptado com suporte a MODO MOCK AUTOMÁTICO (LocalStorage) caso as chaves não estejam configuradas.

import { supabase, isMockMode, triggerMockEvent } from '../supabase';
import efetivoMock from './efetivo_mock.json';

// =====================================================================
// AUXILIARES PARA O MODO MOCK LOCAL (TESTES SEM CONFIGURAÇÃO)
// =====================================================================

function getMockData(key) {
  let data = [];
  const localVal = localStorage.getItem('mock_' + key);
  if (localVal) {
    try {
      data = JSON.parse(localVal);
    } catch (e) {
      data = [];
    }
  }

  let updated = false;

  // Auto-Healing: Popula de forma incremental a partir do arquivo Excel processado
  if (key === 'militares') {
    const existingRgs = new Set(data.map(m => m.rg));
    const excelMilitares = efetivoMock.militares || [];
    
    excelMilitares.forEach(m => {
      if (!existingRgs.has(m.rg)) {
        data.push(m);
        updated = true;
      }
    });

    if (updated || !localVal) {
      localStorage.setItem('mock_militares', JSON.stringify(data));
    }
    return data;
  }

  if (key === 'usuarios') {
    const existingRgs = new Set(data.map(u => u.rg));
    const excelUsers = efetivoMock.usuarios || [];
    
    excelUsers.forEach(u => {
      if (!existingRgs.has(u.rg)) {
        data.push(u);
        updated = true;
      }
    });

    // Garante que o administrador padrão de teste exista
    if (!data.some(u => u.rg === '0001')) {
      data.push({
        id: 'mock-admin-uid',
        role: 'admin',
        milId: null,
        posto: 'Cel',
        nome: 'ADMINISTRADOR DE TESTE',
        rg: '0001',
        senha: 'admin123'
      });
      updated = true;
    }

    if (updated || !localVal) {
      localStorage.setItem('mock_usuarios', JSON.stringify(data));
    }
    return data;
  }

  return data;
}

function setMockData(key, data) {
  localStorage.setItem('mock_' + key, JSON.stringify(data));
  triggerMockEvent(); // Simula instantaneamente a notificação do Supabase Realtime!
}

// =====================================================================
// MAPEADORES DE DADOS (TRANSPARÊNCIA JS <=> POSTGRESQL)
// =====================================================================

function mapMilitarToUI(m) {
  if (!m) return null;
  return {
    id: m.id,
    nome: m.nome,
    posto: m.posto,
    rg: m.rg,
    regime: m.regime,
    secao: m.secao,
    ativo: m.ativo !== false, // Padrão true
    criadoEm: m.criado_em,
  };
}

function mapMilitarToDB(m) {
  if (!m) return null;
  return {
    nome: m.nome,
    posto: m.posto,
    rg: m.rg,
    regime: m.regime,
    secao: m.secao,
    ativo: m.ativo !== false, // Padrão true
  };
}

function mapPermutaToUI(p) {
  if (!p) return null;
  return {
    id: p.id,
    tipo: p.tipo,
    solicitanteId: p.solicitante_id,
    solicitanteNome: p.solicitante_nome,
    receptorId: p.receptor_id,
    receptorNome: p.receptor_nome,
    data: p.data,
    dataRetorno: p.data_retorno,
    tipoSv: p.tipo_sv,
    obs: p.obs,
    mes: p.mes,
    status: p.status,
    criadoEm: p.criado_em,
    confirmadoEm: p.confirmado_em,
    obsConfirmacao: p.obs_confirmacao,
    rejeitadoEm: p.rejeitado_em,
    motivoRejeicao: p.motivo_rejeicao,
    rejeitadoPor: p.rejeitado_por,
    aprovadoEm: p.aprovado_em,
    aprovadoPor: p.aprovado_por,
    quitadoEm: p.quitado_em,
    obsQuitacao: p.obs_quitacao,
  };
}

function mapPermutaToDB(p) {
  if (!p) return null;
  return {
    tipo: p.tipo,
    solicitante_id: p.solicitanteId,
    solicitante_nome: p.solicitanteNome,
    receptor_id: p.receptorId,
    receptor_nome: p.receptorNome,
    data: p.data,
    data_retorno: p.dataRetorno,
    tipo_sv: p.tipoSv,
    obs: p.obs,
    mes: p.mes,
    status: p.status || 'aguardando_confirmacao',
  };
}

// =====================================================================
// ── MILITARES ──
// =====================================================================

export async function getMilitares() {
  if (isMockMode) {
    return getMockData('militares');
  }

  const { data, error } = await supabase
    .from('militares')
    .select('*')
    .order('nome', { ascending: true });
  
  if (error) throw error;
  return data.map(mapMilitarToUI);
}

export async function getMilitar(id) {
  if (isMockMode) {
    return getMockData('militares').find(m => m.id === id) || null;
  }

  const { data, error } = await supabase
    .from('militares')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return mapMilitarToUI(data);
}

export async function addMilitar(dados) {
  if (isMockMode) {
    const list = getMockData('militares');
    const record = {
      id: 'mock-mil-' + Math.random().toString(36).substr(2, 9),
      nome: dados.nome.toUpperCase(),
      posto: dados.posto,
      rg: dados.rg,
      regime: dados.regime,
      secao: dados.secao || '',
      criadoEm: new Date().toISOString()
    };
    list.push(record);
    setMockData('militares', list);
    return record;
  }

  const { data, error } = await supabase
    .from('militares')
    .insert(mapMilitarToDB(dados))
    .select()
    .single();

  if (error) throw error;
  return mapMilitarToUI(data);
}

export async function updateMilitar(id, dados) {
  if (isMockMode) {
    // 1. Atualizar militar mock
    const milList = getMockData('militares');
    const milIdx = milList.findIndex(m => m.id === id);
    if (milIdx !== -1) {
      milList[milIdx] = { ...milList[milIdx], ...dados };
      setMockData('militares', milList);
    }
    // 2. Atualizar usuário mock vinculado
    const usrList = getMockData('usuarios');
    const usrIdx = usrList.findIndex(u => u.milId === id || u.mil_id === id);
    if (usrIdx !== -1) {
      const userUpdate = {
        posto: dados.posto,
        nome: dados.nome.toUpperCase(),
        rg: dados.rg,
        ativo: dados.ativo !== false
      };
      if (dados.senha && dados.senha.trim() !== '') {
        userUpdate.senha = dados.senha;
      }
      usrList[usrIdx] = { ...usrList[usrIdx], ...userUpdate };
      setMockData('usuarios', usrList);
    }
    return;
  }

  // 1. Atualizar militar no Supabase
  const { error: milErr } = await supabase
    .from('militares')
    .update(mapMilitarToDB(dados))
    .eq('id', id);
  if (milErr) throw milErr;

  // 2. Atualizar usuário vinculado no Supabase
  const userUpdate = {
    posto: dados.posto,
    nome: dados.nome.toUpperCase(),
    rg: dados.rg,
    ativo: dados.ativo !== false
  };
  if (dados.senha && dados.senha.trim() !== '') {
    userUpdate.senha = dados.senha;
  }
  
  const { error: usrErr } = await supabase
    .from('usuarios')
    .update(userUpdate)
    .eq('mil_id', id);
  if (usrErr) throw usrErr;
}

// =====================================================================
// ── PERMUTAS ──
// =====================================================================

export async function getPermutas() {
  if (isMockMode) {
    return getMockData('permutas').sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm));
  }

  const { data, error } = await supabase
    .from('permutas')
    .select('*')
    .order('criado_em', { ascending: false });

  if (error) throw error;
  return data.map(mapPermutaToUI);
}

export async function getPermutasMilitar(milId) {
  if (isMockMode) {
    const all = getMockData('permutas');
    return all
      .filter(p => p.solicitanteId === milId || p.receptorId === milId)
      .sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm));
  }

  const { data, error } = await supabase
    .from('permutas')
    .select('*')
    .or(`solicitante_id.eq.${milId},receptor_id.eq.${milId}`)
    .order('criado_em', { ascending: false });

  if (error) throw error;
  return data.map(mapPermutaToUI);
}

export async function solicitarPermuta(dados) {
  if (isMockMode) {
    const list = getMockData('permutas');
    const record = {
      id: 'mock-perm-' + Math.random().toString(36).substr(2, 9),
      tipo: dados.tipo,
      solicitanteId: dados.solicitanteId,
      solicitanteNome: dados.solicitanteNome,
      receptorId: dados.receptorId,
      receptorNome: dados.receptorNome,
      data: dados.data,
      dataRetorno: dados.dataRetorno || null,
      tipoSv: dados.tipoSv,
      obs: dados.obs || '',
      mes: dados.mes,
      status: 'aguardando_confirmacao',
      criadoEm: new Date().toISOString()
    };
    list.push(record);
    setMockData('permutas', list);
    return record;
  }

  const { data, error } = await supabase
    .from('permutas')
    .insert(mapPermutaToDB(dados))
    .select()
    .single();

  if (error) throw error;
  return mapPermutaToUI(data);
}

export async function confirmarPermuta(id, obsConfirmacao) {
  if (isMockMode) {
    const list = getMockData('permutas');
    const idx = list.findIndex(p => p.id === id);
    if (idx !== -1) {
      list[idx] = {
        ...list[idx],
        status: 'aguardando_aprovacao',
        confirmadoEm: new Date().toISOString(),
        obsConfirmacao: obsConfirmacao || ''
      };
      setMockData('permutas', list);
    }
    return;
  }

  const { error } = await supabase
    .from('permutas')
    .update({
      status: 'aguardando_aprovacao',
      confirmado_em: new Date().toISOString(),
      obs_confirmacao: obsConfirmacao || '',
    })
    .eq('id', id);

  if (error) throw error;
}

export async function rejeitarPermuta(id, motivo, quem) {
  if (isMockMode) {
    const list = getMockData('permutas');
    const idx = list.findIndex(p => p.id === id);
    if (idx !== -1) {
      list[idx] = {
        ...list[idx],
        status: 'rejeitada',
        rejeitadoEm: new Date().toISOString(),
        motivoRejeicao: motivo || '',
        rejeitadoPor: quem
      };
      setMockData('permutas', list);
    }
    return;
  }

  const { error } = await supabase
    .from('permutas')
    .update({
      status: 'rejeitada',
      rejeitado_em: new Date().toISOString(),
      motivo_rejeicao: motivo || '',
      rejeitado_por: quem,
    })
    .eq('id', id);

  if (error) throw error;
}

export async function aprovarPermuta(id, adminId) {
  if (isMockMode) {
    const list = getMockData('permutas');
    const idx = list.findIndex(p => p.id === id);
    if (idx !== -1) {
      list[idx] = {
        ...list[idx],
        status: 'aprovada',
        aprovadoEm: new Date().toISOString(),
        aprovadoPor: adminId
      };
      setMockData('permutas', list);
    }
    return;
  }

  const { error } = await supabase
    .from('permutas')
    .update({
      status: 'aprovada',
      aprovado_em: new Date().toISOString(),
      aprovado_por: adminId,
    })
    .eq('id', id);

  if (error) throw error;
}

export async function quitarPermuta(id, obs) {
  if (isMockMode) {
    const list = getMockData('permutas');
    const idx = list.findIndex(p => p.id === id);
    if (idx !== -1) {
      list[idx] = {
        ...list[idx],
        status: 'quitada',
        quitadoEm: new Date().toISOString(),
        obsQuitacao: obs || ''
      };
      setMockData('permutas', list);
    }
    return;
  }

  const { error } = await supabase
    .from('permutas')
    .update({
      status: 'quitada',
      quitado_em: new Date().toISOString(),
      obs_quitacao: obs || '',
    })
    .eq('id', id);

  if (error) throw error;
}

// =====================================================================
// ── CONFIGURAÇÕES DO MÊS (LIMITES)
// =====================================================================

export async function getConfigMes(mes) {
  if (isMockMode) {
    const list = getMockData('config_mes');
    const items = list.filter(item => item.mes === mes);
    const config = {};
    items.forEach(item => {
      config[item.militarId] = item.quantidade;
    });
    return config;
  }

  const { data, error } = await supabase
    .from('config_mes')
    .select('militar_id, quantidade')
    .eq('mes', mes);

  if (error) throw error;

  const config = {};
  data.forEach(item => {
    config[item.militar_id] = item.quantidade;
  });
  return config;
}

export async function setSvsMes(mes, milId, qtd) {
  if (isMockMode) {
    const list = getMockData('config_mes');
    const idx = list.findIndex(item => item.mes === mes && item.militarId === milId);
    if (idx !== -1) {
      list[idx].quantidade = parseInt(qtd) || 0;
    } else {
      list.push({
        id: 'mock-cfg-' + Math.random().toString(36).substr(2, 9),
        mes,
        militarId: milId,
        quantidade: parseInt(qtd) || 0
      });
    }
    setMockData('config_mes', list);
    return;
  }

  const { error } = await supabase
    .from('config_mes')
    .upsert({
      mes,
      militar_id: milId,
      quantidade: parseInt(qtd) || 0
    }, {
      onConflict: 'mes,militar_id'
    });

  if (error) throw error;
}

// =====================================================================
// ── USUÁRIOS (CONTAS DE ACESSO)
// =====================================================================

export async function createUsuario(dados) {
  if (isMockMode) {
    const list = getMockData('usuarios');
    const record = {
      id: 'mock-usr-' + Math.random().toString(36).substr(2, 9),
      role: dados.role || 'militar',
      mil_id: dados.milId,
      posto: dados.posto,
      nome: dados.nome,
      rg: dados.rg,
      senha: dados.senha
    };
    list.push(record);
    setMockData('usuarios', list);
    return record;
  }

  const { data, error } = await supabase
    .from('usuarios')
    .insert({
      role: dados.role || 'militar',
      mil_id: dados.milId,
      posto: dados.posto,
      nome: dados.nome,
      rg: dados.rg,
      senha: dados.senha
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function alterarSenhaUsuario(userId, novaSenha) {
  if (isMockMode) {
    const list = getMockData('usuarios');
    const idx = list.findIndex(u => u.id === userId);
    if (idx !== -1) {
      list[idx].senha = novaSenha;
      setMockData('usuarios', list);
    }
    return;
  }

  const { error } = await supabase
    .from('usuarios')
    .update({ senha: novaSenha })
    .eq('id', userId);

  if (error) throw error;
}

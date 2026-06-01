// src/pages/PortalMilitar.js
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getPermutas, getMilitares, solicitarPermuta, confirmarPermuta, rejeitarPermuta, alterarSenhaUsuario } from '../services/firestore';
import { supabase } from '../supabase';

const C = {
  fundo: '#ffffff', // Vermelho fogo principal CBMERJ
  fundo2: '#8f0000', // Vermelho escuro para card/header (contraste elegante)
  ouro: '#ffffff', // Branco para contraste principal (substitui o antigo ciano)
  ouroClaro: '#f5f6fa',
  ouroPale: 'rgba(255, 255, 255, 0.12)',
  creme: '#ffffff',
  cinza: '#f2dcdc', // Branco com tom quente de vermelho suave
  borda: 'rgba(255, 255, 255, 0.25)', // Borda branca translúcida de alto contraste
  verde: '#27ae60',
  verdePale: 'rgba(39,174,96,0.12)',
  vermelho: '#e74c3c',
  vermelhoPale: 'rgba(231,76,60,0.12)',
  laranja: '#ffbe76',
  laranjaPale: 'rgba(255,190,118,0.15)',
};

export default function PortalMilitar() {
  const { perfil, logout } = useAuth();
  const [aba, setAba] = useState('minhas');
  const [permutas, setPermutas] = useState([]);
  const [militares, setMilitares] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // 'nova' | 'confirmar' | 'rejeitar'
  const [permutaSel, setPermutaSel] = useState(null);
  const [form, setForm] = useState({ tipo: 'real', receptorId: '', data: '', dataRetorno: '', tipoSv: '12h', obs: '' });
  const [obsModal, setObsModal] = useState('');
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [meuMilitar, setMeuMilitar] = useState(null);
  const [formSenha, setFormSenha] = useState({ senhaAtual: '', novaSenha: '', confSenha: '' });

  const milId = perfil?.milId;

  useEffect(() => {
    carregar();

    // Inscrever no canal Realtime do Supabase para manter a tela do militar 100% reativa
    const channel = supabase
      .channel('militar-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'permutas' }, () => {
        carregar();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'militares' }, () => {
        carregar();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [milId]);

  async function carregar() {
    setLoading(true);
    // Para validar propriedades com precisão, carregamos TODAS as permutas ativas do sistema
    const [p, m] = await Promise.all([getPermutas(), getMilitares()]);
    setPermutas(p);
    const meu = m.find(x => x.id === milId);
    setMeuMilitar(meu);
    setMilitares(m.filter(x => x.id !== milId));
    setLoading(false);
  }

  function nomeMil(id) {
    if (id === milId) return 'Você';
    const m = militares.find(x => x.id === id);
    return m ? `${m.posto} ${m.nome}` : id;
  }

  function fmtData(iso) {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  function verificar72h(dataStr) {
    const agora = new Date();
    const srv = new Date(dataStr + 'T00:00:00');
    const diffH = (srv - agora) / 36e5;
    return diffH >= 72;
  }

  function calcularSaldoDia(militarId, dataVerificar, permutaIdExcluir = null) {
    if (!dataVerificar) return 1;

    // Todo militar começa detendo a posse inicial (=1) do dia que quer permutar
    let saldo = 1;

    // Consideramos apenas permutas que estão ativas no fluxo de aprovação ou aprovadas, ignorando a permuta atual sob validação
    const permutasAtivas = permutas.filter(p => p.status !== 'rejeitada' && p.id !== permutaIdExcluir);

    permutasAtivas.forEach(p => {
      // 1. Doador (Solicitante) doando a data original
      if (p.solicitanteId === militarId && p.data === dataVerificar) {
        saldo -= 1;
      }
      // 2. Doador (Receptor) doando a data de retorno (apenas em permuta real)
      if (p.tipo === 'real' && p.receptorId === militarId && p.dataRetorno === dataVerificar) {
        saldo -= 1;
      }
      // 3. Receptor recebendo a data original (trabalha no dia)
      if (p.receptorId === militarId && p.data === dataVerificar) {
        saldo += 1;
      }
      // 4. Solicitante recebendo a data de retorno (trabalha no dia do retorno, em permuta real)
      if (p.tipo === 'real' && p.solicitanteId === militarId && p.dataRetorno === dataVerificar) {
        saldo += 1;
      }
    });

    return saldo;
  }

  async function handleSolicitar(e) {
    e.preventDefault();
    setErro('');
    if (!form.receptorId) { setErro('Selecione o outro militar.'); return; }
    if (!form.data) { setErro('Informe a data do seu serviço.'); return; }

    // Regra 1: Em permuta real (troca), a data de retorno é obrigatória
    if (form.tipo === 'real' && !form.dataRetorno) {
      setErro('Informe a data de retorno para a troca.');
      return;
    }

    if (!verificar72h(form.data)) {
      setErro('⛔ Solicitação bloqueada: o seu serviço está a menos de 72 horas de antecedência.');
      return;
    }

    if (form.tipo === 'real') {
      if (!verificar72h(form.dataRetorno)) {
        setErro('⛔ Solicitação bloqueada: o serviço de retorno está a menos de 72 horas de antecedência.');
        return;
      }
      if (form.data === form.dataRetorno) {
        setErro('⛔ A data de retorno não pode ser igual à data do seu serviço.');
        return;
      }
    }

    // Regra 2: Validar se o solicitante possui o dia de serviço para doar
    if (calcularSaldoDia(milId, form.data) < 1) {
      setErro(`⛔ Você já permutou o dia de serviço ${fmtData(form.data)} (ou tem uma solicitação pendente para ele).`);
      return;
    }

    // Regra 2: Em permuta real, validar se o receptor possui o dia de retorno para doar
    if (form.tipo === 'real' && calcularSaldoDia(form.receptorId, form.dataRetorno) < 1) {
      setErro(`⛔ O militar selecionado já permutou o dia de retorno ${fmtData(form.dataRetorno)} (ou tem uma solicitação pendente).`);
      return;
    }

    try {
      await solicitarPermuta({
        tipo: form.tipo,
        solicitanteId: milId,
        solicitanteNome: `${perfil.posto} ${perfil.nome}`,
        receptorId: form.receptorId,
        receptorNome: nomeMil(form.receptorId),
        data: form.data,
        dataRetorno: form.tipo === 'real' ? form.dataRetorno : null,
        tipoSv: form.tipoSv,
        obs: form.obs,
        mes: form.data.slice(0, 7),
      });
      setSucesso('✅ Solicitação enviada! Aguardando confirmação do outro militar.');
      setModal(null);
      setForm({ tipo: 'real', receptorId: '', data: '', dataRetorno: '', tipoSv: '12h', obs: '' });
      carregar();
    } catch { setErro('Erro ao solicitar. Tente novamente.'); }
  }

  async function handleConfirmar() {
    setErro('');
    // Regra 2: No momento da confirmação, validar se o receptor (Você) ainda detém a posse do dia de retorno!
    if (permutaSel.tipo === 'real') {
      if (calcularSaldoDia(milId, permutaSel.dataRetorno, permutaSel.id) < 1) {
        setErro(`⛔ Confirmação bloqueada: você já permutou o dia de retorno ${fmtData(permutaSel.dataRetorno)} (ou tem uma solicitação pendente para ele).`);
        return;
      }
    }

    try {
      await confirmarPermuta(permutaSel.id, obsModal);
      setSucesso('✅ Permuta confirmada! Aguardando aprovação da administração.');
      setModal(null); setObsModal(''); carregar();
    } catch { setErro('Erro ao confirmar.'); }
  }

  async function handleRejeitar() {
    try {
      await rejeitarPermuta(permutaSel.id, obsModal, 'militar');
      setSucesso('Permuta recusada.');
      setModal(null); setObsModal(''); carregar();
    } catch { setErro('Erro ao rejeitar.'); }
  }

  async function handleAlterarSenha(e) {
    e.preventDefault();
    setErro('');
    setSucesso('');

    if (!formSenha.senhaAtual || !formSenha.novaSenha || !formSenha.confSenha) {
      setErro('⛔ Preencha todos os campos.');
      return;
    }

    if (formSenha.novaSenha !== formSenha.confSenha) {
      setErro('⛔ A nova senha e a confirmação não coincidem.');
      return;
    }

    if (formSenha.novaSenha.length < 6) {
      setErro('⛔ A nova senha deve ter no mínimo 6 caracteres.');
      return;
    }

    try {
      // Validar se a senha atual está correta usando o endpoint de RPC de login
      const { data, error } = await supabase.rpc('login_militar', {
        p_rg: perfil.rg,
        p_senha: formSenha.senhaAtual
      });

      if (error || !data || data.length === 0) {
        setErro('⛔ Senha atual incorreta.');
        return;
      }

      // Atualizar a senha do usuário
      await alterarSenhaUsuario(perfil.id, formSenha.novaSenha);
      setSucesso('✅ Senha alterada com sucesso!');
      setModal(null);
      setFormSenha({ senhaAtual: '', novaSenha: '', confSenha: '' });
    } catch (err) {
      console.error(err);
      setErro('⛔ Erro ao alterar a senha. Tente novamente.');
    }
  }

  // Filtra permutas por aba a partir de todas as permutas carregadas
  const minhas = permutas.filter(p => p.solicitanteId === milId);
  const pendConf = permutas.filter(p => p.receptorId === milId && p.status === 'aguardando_confirmacao');
  const historico = permutas.filter(p => p.solicitanteId === milId || p.receptorId === milId);

  const abaData = { minhas, pendentes: pendConf, historico };
  const lista = abaData[aba] || [];

  function badgeStatus(s) {
    const map = {
      aguardando_confirmacao: ['⏳', '#f0a050', C.laranjaPale, 'Ag. Confirmação'],
      aguardando_aprovacao: ['🔍', C.ouroClaro, C.ouroPale, 'Ag. Aprovação'],
      aprovada: ['✅', '#7dbd72', C.verdePale, 'Aprovada'],
      rejeitada: ['❌', '#e07070', C.vermelhoPale, 'Rejeitada'],
      quitada: ['🏁', C.cinza, 'rgba(122,138,106,0.15)', 'Quitada'],
    };
    const [ico, cor, bg, txt] = map[s] || ['?', C.cinza, 'transparent', s];
    return (
      <span style={{ background: bg, color: cor, border: `1px solid ${cor}40`, borderRadius: 4, padding: '2px 8px', fontSize: '0.7rem', fontFamily: "'Montserrat', sans-serif", fontWeight: 700 }}>
        {ico} {txt}
      </span>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: C.fundo, color: C.creme, fontFamily: "'Montserrat', sans-serif" }}>
      {/* HEADER */}
      <div style={{ background: C.fundo2, borderBottom: `2px solid ${C.borda}`, padding: '1rem 1.2rem', display: 'flex', alignItems: 'center', gap: '1rem', position: 'sticky', top: 0, zIndex: 100 }}>
        <img src="/heraldica_gmar.png" alt="Logo GMar" style={{ width: 40, height: 40, objectFit: 'contain', filter: 'drop-shadow(0 0 8px rgba(255,255,255,0.3))' }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.3rem', letterSpacing: 3, color: C.creme }}>CBMERJ · 4º GMar</div>
          <div style={{ fontFamily: "'Montserrat', sans-serif", fontSize: '0.62rem', fontWeight: 600, color: C.ouro, letterSpacing: 2 }}>{perfil?.posto} {perfil?.nome} · RG {perfil?.rg}</div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => { setModal('alterar_senha'); setFormSenha({ senhaAtual: '', novaSenha: '', confSenha: '' }); setErro(''); }}
            style={{ background: 'transparent', border: `1px solid ${C.borda}`, color: C.ouro, borderRadius: 6, padding: '0.4rem 0.8rem', cursor: 'pointer', fontSize: '0.7rem', fontFamily: "'Montserrat', sans-serif", fontWeight: 700, transition: 'all 0.2s' }}>
            🔑 SENHA
          </button>
          <button onClick={logout} style={{ background: 'transparent', border: `1px solid ${C.borda}`, color: C.cinza, borderRadius: 6, padding: '0.4rem 0.8rem', cursor: 'pointer', fontSize: '0.7rem', fontFamily: "'Montserrat', sans-serif", fontWeight: 700, transition: 'all 0.2s' }}>
            SAIR
          </button>
        </div>
      </div>

      <div style={{ padding: '1.2rem', maxWidth: 700, margin: '0 auto' }}>
        {sucesso && <div style={{ background: C.verdePale, border: `1px solid ${C.verde}40`, borderRadius: 8, padding: '0.8rem 1rem', marginBottom: '1rem', color: '#7dbd72', fontSize: '0.9rem', cursor: 'pointer' }} onClick={() => setSucesso('')}>{sucesso}</div>}

        {/* BOTÃO NOVA PERMUTA OU AVISO DE CONTA INATIVA */}
        {meuMilitar?.ativo !== false ? (
          <button onClick={() => { setModal('nova'); setErro(''); }}
            style={{ width: '100%', background: C.fundo2, color: '#ffffff', border: 'none', borderRadius: 10, padding: '1rem', fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '0.85rem', letterSpacing: 2, cursor: 'pointer', marginBottom: '1.2rem', boxShadow: '0 4px 15px rgba(143, 0, 0, 0.25)', transition: 'all 0.2s' }}>
            ➕ SOLICITAR NOVA PERMUTA
          </button>
        ) : (
          <div style={{ background: C.vermelhoPale, border: `1px solid ${C.vermelho}40`, borderRadius: 10, padding: '1rem', color: '#c0392b', textAlign: 'center', marginBottom: '1.2rem', fontFamily: "'Montserrat', sans-serif", fontSize: '0.85rem', fontWeight: 'bold' }}>
            ⚠️ SUA CONTA ESTÁ INATIVA. Você não pode propor ou confirmar novas permutas.
          </div>
        )}

        {/* ALERTA PENDENTES */}
        {pendConf.length > 0 && (
          <div style={{ background: C.laranjaPale, border: `1px solid ${C.laranja}40`, borderRadius: 10, padding: '0.9rem 1rem', marginBottom: '1.2rem', color: '#f0a050', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
            <span style={{ fontSize: '1.4rem' }}>⚠️</span>
            <span><strong>{pendConf.length} permuta(s)</strong> aguardando sua confirmação!</span>
          </div>
        )}

        {/* ABAS */}
        <div style={{ display: 'flex', gap: 2, background: '#f5f6fa', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 8, padding: 3, marginBottom: '1.2rem' }}>
          {[['minhas', `Minhas (${minhas.length})`], ['pendentes', `Confirmar (${pendConf.length})`], ['historico', 'Histórico']].map(([k, v]) => (
            <button key={k} onClick={() => setAba(k)}
              style={{ flex: 1, background: aba === k ? C.fundo2 : 'transparent', color: aba === k ? '#ffffff' : '#586069', border: 'none', borderRadius: 5, padding: '0.6rem 0.5rem', cursor: 'pointer', fontFamily: "'Montserrat', sans-serif", fontSize: '0.68rem', fontWeight: aba === k ? 700 : 500, letterSpacing: 1, transition: 'all .2s', boxShadow: aba === k ? '0 4px 12px rgba(143, 0, 0, 0.2)' : 'none' }}>
              {v}
            </button>
          ))}
        </div>

        {/* LISTA */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: C.fundo2 }}>Carregando...</div>
        ) : lista.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: C.fundo2 }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🔄</div>
            <div style={{ fontFamily: "'Montserrat', sans-serif", fontSize: '0.8rem' }}>Nenhuma permuta aqui</div>
          </div>
        ) : lista.map(p => (
          <div key={p.id} style={{ background: C.fundo2, border: `1px solid ${C.borda}`, borderRadius: 12, padding: '1rem 1.2rem', marginBottom: '0.8rem', boxShadow: '0 4px 15px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
              <div>
                <span style={{ background: p.tipo === 'paga' ? C.laranjaPale : C.ouroPale, color: p.tipo === 'paga' ? '#f0a050' : C.ouro, border: `1px solid ${p.tipo === 'paga' ? C.laranja : C.ouro}40`, borderRadius: 4, padding: '1px 7px', fontSize: '0.65rem', fontFamily: "'Montserrat', sans-serif", fontWeight: 700, marginRight: 6 }}>
                  {p.tipo === 'paga' ? '💰 PAGA' : '🤝 TROCA'}
                </span>
                {badgeStatus(p.status)}
              </div>
              <span style={{ fontFamily: "'Montserrat', sans-serif", fontSize: '0.75rem', color: C.ouro, fontWeight: 600 }}>
                {p.tipo === 'real' ? `${fmtData(p.data)} ⇆ ${fmtData(p.dataRetorno)}` : fmtData(p.data)}
              </span>
            </div>
            <div style={{ fontSize: '0.95rem', marginBottom: '0.3rem', color: C.creme }}>
              <strong>{nomeMil(p.solicitanteId)}</strong>
              <span style={{ color: C.cinza }}> → </span>
              <strong>{nomeMil(p.receptorId)}</strong>
            </div>
            <div style={{ fontSize: '0.8rem', color: C.cinza, fontFamily: "'Montserrat', sans-serif" }}>{p.tipoSv} · {p.mes}</div>
            {p.obs && <div style={{ fontSize: '0.82rem', color: C.cinza, fontStyle: 'italic', marginTop: '0.3rem', borderLeft: `2px solid ${C.ouroClaro}`, paddingLeft: 6 }}>{p.obs}</div>}

            {/* Ações para confirmar */}
            {aba === 'pendentes' && p.receptorId === milId && p.status === 'aguardando_confirmacao' && (
              meuMilitar?.ativo !== false ? (
                <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.8rem' }}>
                  <button onClick={() => { setPermutaSel(p); setModal('confirmar'); setObsModal(''); setErro(''); }}
                    style={{ flex: 1, background: C.verdePale, color: '#7dbd72', border: `1px solid ${C.verde}40`, borderRadius: 6, padding: '0.5rem', cursor: 'pointer', fontFamily: "'Montserrat', sans-serif", fontSize: '0.7rem', fontWeight: 700, transition: 'all 0.2s' }}>
                    ✅ CONFIRMAR
                  </button>
                  <button onClick={() => { setPermutaSel(p); setModal('rejeitar'); setObsModal(''); setErro(''); }}
                    style={{ flex: 1, background: C.vermelhoPale, color: '#e07070', border: `1px solid ${C.vermelho}40`, borderRadius: 6, padding: '0.5rem', cursor: 'pointer', fontFamily: "'Montserrat', sans-serif", fontSize: '0.7rem', fontWeight: 700, transition: 'all 0.2s' }}>
                    ❌ RECUSAR
                  </button>
                </div>
              ) : (
                <div style={{ color: '#e07070', fontSize: '0.8rem', marginTop: '0.8rem', fontStyle: 'italic', fontFamily: "'Montserrat', sans-serif", textAlign: 'center', width: '100%' }}>
                  ⚠️ Você está inativo e não pode responder a esta solicitação.
                </div>
              )
            )}
          </div>
        ))}
      </div>

      {/* MODAL NOVA PERMUTA */}
      {modal === 'nova' && (
        <Overlay onClose={() => setModal(null)}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.4rem', letterSpacing: 2, color: C.ouro, marginBottom: '1rem', borderBottom: `1px solid ${C.borda}`, paddingBottom: 6 }}>Nova Permuta</div>

          <div style={{ display: 'flex', gap: 4, marginBottom: '1rem', background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: 3 }}>
            {[['real', '🤝 Real (Troca)'], ['paga', '💰 Paga']].map(([v, l]) => (
              <button key={v} onClick={() => setForm(f => ({ ...f, tipo: v }))}
                style={{ flex: 1, background: form.tipo === v ? (v === 'paga' ? C.laranjaPale : C.ouroPale) : 'transparent', color: form.tipo === v ? (v === 'paga' ? '#f0a050' : C.ouro) : C.cinza, border: 'none', borderRadius: 5, padding: '0.5rem', cursor: 'pointer', fontFamily: "'Montserrat', sans-serif", fontSize: '0.65rem', fontWeight: 700, transition: 'all 0.2s' }}>
                {l}
              </button>
            ))}
          </div>

          <form onSubmit={handleSolicitar}>
            <Campo label="Outro Militar">
              <select value={form.receptorId} onChange={e => setForm(f => ({ ...f, receptorId: e.target.value }))} style={inpStyle}>
                <option value="">Selecione...</option>
                {militares.filter(m => m.ativo !== false).map(m => <option key={m.id} value={m.id}>{m.posto} {m.nome} ({m.regime})</option>)}
              </select>
            </Campo>

            <Campo label={form.tipo === 'real' ? "Sua Data de Serviço (que ele irá tirar)" : "Data do Serviço"}>
              <input type="date" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} style={inpStyle} />
            </Campo>

            {form.tipo === 'real' && (
              <Campo label="Data de Retorno do Serviço (que você irá tirar em troca)">
                <input type="date" value={form.dataRetorno} onChange={e => setForm(f => ({ ...f, dataRetorno: e.target.value }))} style={inpStyle} />
              </Campo>
            )}

            <Campo label="Tipo de Serviço">
              <select value={form.tipoSv} onChange={e => setForm(f => ({ ...f, tipoSv: e.target.value }))} style={inpStyle}>
                <option value="12h">Serviço 12h</option>
                <option value="24h">Serviço 24h</option>
                <option value="complementar">Serviço Complementar</option>
              </select>
            </Campo>

            <Campo label="Observação (opcional)">
              <textarea value={form.obs} onChange={e => setForm(f => ({ ...f, obs: e.target.value }))} style={txtAreaStyle} placeholder="Ala, detalhes..." />
            </Campo>

            {erro && <div style={{ background: C.vermelhoPale, border: `1px solid ${C.vermelho}40`, borderRadius: 6, color: '#c0392b', fontSize: '0.85rem', padding: '0.6rem', marginBottom: '0.8rem' }}>{erro}</div>}

            <button type="submit" style={{ width: '100%', background: C.ouro, color: '#8f0000', border: 'none', borderRadius: 8, padding: '0.8rem', fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer', letterSpacing: 1, boxShadow: '0 4px 15px rgba(255,255,255,0.2)', transition: 'all 0.2s' }}>
              ENVIAR SOLICITAÇÃO
            </button>
          </form>
        </Overlay>
      )}

      {/* MODAL CONFIRMAR */}
      {modal === 'confirmar' && permutaSel && (
        <Overlay onClose={() => setModal(null)}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.4rem', letterSpacing: 2, color: '#7dbd72', marginBottom: '0.8rem', borderBottom: `1px solid ${C.borda}`, paddingBottom: 6 }}>Confirmar Permuta</div>
          <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, borderLeft: `3px solid ${C.vermelho}`, padding: '0.7rem', marginBottom: '1rem', fontSize: '0.9rem', color: C.cinza }}>
            {nomeMil(permutaSel.solicitanteId)} solicitou que você tire o serviço dele em <strong>{fmtData(permutaSel.data)}</strong> ({permutaSel.tipoSv}).
            {permutaSel.tipo === 'real' && (
              <div style={{ marginTop: 4, color: C.ouro }}>
                Em troca, ele irá tirar o seu serviço em <strong>{fmtData(permutaSel.dataRetorno)}</strong>.
              </div>
            )}
          </div>
          <Campo label="Observação (opcional)">
            <textarea value={obsModal} onChange={e => setObsModal(e.target.value)} style={txtAreaStyle} placeholder="Alguma observação..." />
          </Campo>
          {erro && <div style={{ background: C.vermelhoPale, border: `1px solid ${C.vermelho}40`, borderRadius: 6, color: '#c0392b', fontSize: '0.85rem', padding: '0.6rem', marginBottom: '0.8rem' }}>{erro}</div>}
          <div style={{ display: 'flex', gap: '0.6rem' }}>
            <button onClick={() => setModal(null)} style={{ flex: 1, background: 'transparent', color: C.cinza, border: `1px solid ${C.borda}`, borderRadius: 8, padding: '0.75rem', cursor: 'pointer', fontFamily: "'Montserrat', sans-serif", fontSize: '0.75rem' }}>CANCELAR</button>
            <button onClick={handleConfirmar} style={{ flex: 2, background: C.verdePale, color: '#7dbd72', border: `1px solid ${C.verde}40`, borderRadius: 8, padding: '0.75rem', cursor: 'pointer', fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '0.75rem' }}>✅ CONFIRMAR</button>
          </div>
        </Overlay>
      )}

      {/* MODAL REJEITAR */}
      {modal === 'rejeitar' && permutaSel && (
        <Overlay onClose={() => setModal(null)}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.4rem', letterSpacing: 2, color: '#e07070', marginBottom: '0.8rem', borderBottom: `1px solid ${C.borda}`, paddingBottom: 6 }}>Recusar Permuta</div>
          <Campo label="Motivo da recusa">
            <textarea value={obsModal} onChange={e => setObsModal(e.target.value)} style={{ ...txtAreaStyle, minHeight: 70 }} placeholder="Informe o motivo..." />
          </Campo>
          {erro && <div style={{ background: C.vermelhoPale, border: `1px solid ${C.vermelho}40`, borderRadius: 6, color: '#c0392b', fontSize: '0.85rem', padding: '0.6rem', marginBottom: '0.8rem' }}>{erro}</div>}
          <div style={{ display: 'flex', gap: '0.6rem' }}>
            <button onClick={() => setModal(null)} style={{ flex: 1, background: 'transparent', color: C.cinza, border: `1px solid ${C.borda}`, borderRadius: 8, padding: '0.75rem', cursor: 'pointer', fontFamily: "'Montserrat', sans-serif", fontSize: '0.75rem' }}>CANCELAR</button>
            <button onClick={handleRejeitar} style={{ flex: 2, background: C.vermelhoPale, color: '#e07070', border: `1px solid ${C.vermelho}40`, borderRadius: 8, padding: '0.75rem', cursor: 'pointer', fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '0.75rem' }}>❌ RECUSAR</button>
          </div>
        </Overlay>
      )}

      {/* MODAL ALTERAR SENHA */}
      {modal === 'alterar_senha' && (
        <Overlay onClose={() => setModal(null)}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.4rem', letterSpacing: 2, color: C.ouro, marginBottom: '1rem', borderBottom: `1px solid ${C.borda}`, paddingBottom: 6 }}>
            Alterar Senha
          </div>

          <form onSubmit={handleAlterarSenha}>
            <Campo label="Senha Atual">
              <input type="password" value={formSenha.senhaAtual} onChange={e => setFormSenha(s => ({ ...s, senhaAtual: e.target.value }))} style={inpStyle} placeholder="Digite sua senha atual" />
            </Campo>

            <Campo label="Nova Senha">
              <input type="password" value={formSenha.novaSenha} onChange={e => setFormSenha(s => ({ ...s, novaSenha: e.target.value }))} style={inpStyle} placeholder="Mínimo 6 caracteres" />
            </Campo>

            <Campo label="Confirmar Nova Senha">
              <input type="password" value={formSenha.confSenha} onChange={e => setFormSenha(s => ({ ...s, confSenha: e.target.value }))} style={inpStyle} placeholder="Confirme a nova senha" />
            </Campo>

            {erro && (
              <div style={{ background: C.vermelhoPale, border: `1px solid ${C.vermelho}40`, borderRadius: 6, color: '#c0392b', fontSize: '0.85rem', padding: '0.6rem', marginBottom: '0.8rem' }}>
                {erro}
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1rem' }}>
              <button type="button" onClick={() => setModal(null)} style={{ flex: 1, background: 'transparent', color: C.cinza, border: `1px solid ${C.borda}`, borderRadius: 8, padding: '0.75rem', cursor: 'pointer', fontFamily: "'Montserrat', sans-serif", fontSize: '0.75rem' }}>
                CANCELAR
              </button>
              <button type="submit" style={{ flex: 2, background: C.ouro, color: '#8f0000', border: 'none', borderRadius: 8, padding: '0.75rem', cursor: 'pointer', fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '0.75rem', letterSpacing: 1, boxShadow: '0 4px 15px rgba(255,255,255,0.2)' }}>
                CONFIRMAR
              </button>
            </div>
          </form>
        </Overlay>
      )}
    </div>
  );
}

function Campo({ label, children }) {
  return (
    <div style={{ marginBottom: '0.9rem' }}>
      <label style={{ display: 'block', fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '0.6rem', letterSpacing: 2, color: C.ouro, marginBottom: '0.3rem', textTransform: 'uppercase' }}>{label}</label>
      {children}
    </div>
  );
}

function Overlay({ children, onClose }) {
  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 500, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '1rem', backdropFilter: 'blur(4px)' }}>
      <div style={{ background: C.fundo2, border: `1px solid ${C.borda}`, borderRadius: '16px 16px 12px 12px', padding: '1.5rem', width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }}>
        {children}
      </div>
    </div>
  );
}

const inpStyle = {
  width: '100%', background: 'rgba(0,0,0,0.4)', border: `1px solid ${C.borda}`,
  borderRadius: 8, color: '#f5f6fa', fontFamily: "'Montserrat', sans-serif", fontSize: '0.92rem',
  padding: '0 0.9rem', height: '42px', outline: 'none', boxSizing: 'border-box',
};

const txtAreaStyle = {
  ...inpStyle,
  height: 'auto',
  minHeight: 60,
  padding: '0.65rem 0.9rem',
  resize: 'vertical',
};

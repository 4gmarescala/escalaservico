// src/pages/PainelAdmin.js
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getMilitares, getPermutas, aprovarPermuta, rejeitarPermuta, quitarPermuta, addMilitar, getConfigMes, setSvsMes, createUsuario, updateMilitar } from '../services/firestore';
import { supabase } from '../supabase';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

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
  vermelhoClaro: '#ffffff',
  laranja: '#ffbe76',
  laranjaPale: 'rgba(255,190,118,0.15)',
};

const controlStyle = {
  width: '100%',
  background: 'rgba(0,0,0,.25)',
  border: `1px solid rgba(255, 255, 255, 0.25)`,
  borderRadius: 6,
  color: '#f5f6fa',
  fontFamily: "'Montserrat', sans-serif",
  fontSize: '0.88rem',
  padding: '0 0.8rem',
  height: '40px',
  boxSizing: 'border-box',
  outline: 'none',
};

function fmtData(iso) { if (!iso) return '—'; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; }
function fmtMes(ym) {
  if (!ym) return '—';
  const [y, m] = ym.split('-');
  const ms = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${ms[parseInt(m) - 1]}/${y}`;
}
function fmtDateTime(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const dateStr = d.toLocaleDateString('pt-BR');
    const timeStr = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return `${dateStr} ${timeStr}`;
  } catch (e) {
    return iso;
  }
}

export default function PainelAdmin() {
  const { perfil, logout } = useAuth();
  const [aba, setAba] = useState('dashboard');
  const [militares, setMilitares] = useState([]);
  const [permutas, setPermutas] = useState([]);
  const [configMes, setConfigMes] = useState({});
  const [mesRef, setMesRef] = useState(new Date().toISOString().slice(0, 7));
  const [mesSaldoSel, setMesSaldoSel] = useState(new Date().toISOString().slice(0, 7));
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [permutaSel, setPermutaSel] = useState(null);
  const [motivo, setMotivo] = useState('');
  const [toast, setToast] = useState('');
  const [formMil, setFormMil] = useState({ posto: '', nome: '', rg: '', regime: '12h', secao: '', senha: '' });
  const [busca, setBusca] = useState('');
  const [buscaRel, setBuscaRel] = useState('');
  const [sortField, setSortField] = useState('data');
  const [sortAsc, setSortAsc] = useState(true);
  const [militarSel, setMilitarSel] = useState(null);
  const [formEdit, setFormEdit] = useState({ posto: '', nome: '', rg: '', regime: '12h', secao: '', ativo: true, senha: '' });

  useEffect(() => {
    carregar();

    // Inscrever no canal Realtime do Supabase para manter a tela 100% reativa
    const channel = supabase
      .channel('admin-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'permutas' }, () => {
        carregar();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'militares' }, () => {
        carregar();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'config_mes' }, () => {
        carregar();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [mesRef]);

  async function carregar() {
    setLoading(true);
    const [m, p, cfg] = await Promise.all([getMilitares(), getPermutas(), getConfigMes(mesRef)]);
    setMilitares(m);
    setPermutas(p);
    setConfigMes(cfg);
    setLoading(false);
  }

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000); }

  function nomeMil(id) {
    const m = militares.find(x => x.id === id);
    return m ? `${m.rg} ${m.posto} ${m.nome}` : id || '—';
  }

  function svsMilMes(milId) {
    return configMes[milId] ?? (militares.find(x => x.id === milId)?.regime === '12h' ? 10 : militares.find(x => x.id === milId)?.regime === '24h' ? 7 : 2);
  }

  function limitePago(milId) { return Math.floor(svsMilMes(milId) / 2); }

  function jaPageiMes(milId) {
    const pagou = permutas.filter(p => p.tipo === 'paga' && p.solicitanteId === milId && p.mes === mesRef && p.status !== 'rejeitada').length;
    const entrou = permutas.filter(p => p.tipo === 'paga' && p.receptorId === milId && p.mes === mesRef && p.status !== 'rejeitada').length;
    return Math.max(0, pagou - entrou);
  }

  function saldoRealNoMes(milId, mes) {
    let s = 0;
    permutas.filter(p => p.tipo === 'paga' && p.status === 'aprovada' && p.mes === mes).forEach(p => {
      if (p.solicitanteId === milId) s--; // Solicitante fica devendo (-1)
      if (p.receptorId === milId) s++;    // Receptor tem a receber (+1)
    });
    return s;
  }

  async function handleAprovar() {
    if (permutaSel.tipo === 'real') {
      // Permutas do tipo Permuta Dupla envolvem duas datas e se balanceiam sozinhas, logo vão direto para Quitadas
      await quitarPermuta(permutaSel.id, 'Quitada automaticamente na aprovação (Permuta Dupla)');
    } else {
      // Permutas Simples mantêm-se Aprovadas para registrar o saldo devedor até quitação posterior
      await aprovarPermuta(permutaSel.id, perfil?.nome || 'admin');
    }
    showToast('✅ Permuta aprovada!');
    setModal(null); carregar();
  }

  async function handleRejeitar() {
    await rejeitarPermuta(permutaSel.id, motivo, 'admin');
    showToast('Permuta rejeitada.');
    setModal(null); setMotivo(''); carregar();
  }

  async function handleQuitar() {
    await quitarPermuta(permutaSel.id, motivo);
    showToast('✅ Permuta quitada!');
    setModal(null); setMotivo(''); carregar();
  }

  async function handleCancelar() {
    await rejeitarPermuta(permutaSel.id, motivo, 'admin');
    showToast('🚫 Permuta cancelada!');
    setModal(null); setMotivo(''); carregar();
  }

  async function handleAddMilitar(e) {
    e.preventDefault();
    if (!formMil.posto || !formMil.nome || !formMil.rg || !formMil.senha) { showToast('⚠ Preencha todos os campos obrigatórios.'); return; }
    try {
      // 1. Salvar militar no banco
      const milRef = await addMilitar({ posto: formMil.posto, nome: formMil.nome.toUpperCase(), rg: formMil.rg, regime: formMil.regime, secao: formMil.secao });
      // 2. Criar usuário vinculado (a trigger do PostgreSQL irá criptografar a senha)
      await createUsuario({ role: 'militar', milId: milRef.id, posto: formMil.posto, nome: formMil.nome.toUpperCase(), rg: formMil.rg, senha: formMil.senha });

      showToast('✅ Militar cadastrado com acesso ao sistema!');
      setFormMil({ posto: '', nome: '', rg: '', regime: '12h', secao: '', senha: '' });
      carregar();
    } catch (err) {
      showToast('Erro: ' + (err.message.includes('unique') || err.message.includes('duplicate') ? 'RG já cadastrado no sistema.' : err.message));
    }
  }

  async function handleEditMilitar(e) {
    e.preventDefault();
    if (!formEdit.posto || !formEdit.nome || !formEdit.rg) { showToast('⚠ Preencha todos os campos obrigatórios.'); return; }
    try {
      const updatePayload = {
        posto: formEdit.posto,
        nome: formEdit.nome.toUpperCase(),
        rg: formEdit.rg,
        regime: formEdit.regime,
        secao: formEdit.secao,
        ativo: formEdit.ativo,
      };
      if (formEdit.senha && formEdit.senha.trim() !== '') {
        updatePayload.senha = formEdit.senha.trim();
      }
      await updateMilitar(militarSel.id, updatePayload);
      showToast('✅ Dados do militar atualizados com sucesso!');
      setModal(null);
      carregar();
    } catch (err) {
      showToast('Erro ao atualizar: ' + err.message);
    }
  }

  async function handleSetSvs(milId, val) {
    await setSvsMes(mesRef, milId, parseInt(val) || 0);
    setConfigMes(c => ({ ...c, [milId]: parseInt(val) || 0 }));
  }

  const pendAprov = permutas.filter(p => p.status === 'aguardando_aprovacao');
  const pendConf = permutas.filter(p => p.status === 'aguardando_confirmacao');
  const noLimite = militares.filter(m => jaPageiMes(m.id) >= limitePago(m.id) && limitePago(m.id) > 0);

  const mesesComSaldo = Array.from(
    new Set(
      permutas
        .filter(p => p.tipo === 'paga' && p.status === 'aprovada')
        .map(p => p.mes)
    )
  ).sort((a, b) => b.localeCompare(a));
  const mesesFiltrados = mesesComSaldo.filter(mes =>
    militares.some(m => saldoRealNoMes(m.id, mes) !== 0)
  );

  function handleSort(field) {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  }

  const sortedPermutas = [...permutas].sort((a, b) => {
    let valA = '';
    let valB = '';

    if (sortField === 'data') {
      valA = a.data || '';
      valB = b.data || '';
    } else if (sortField === 'nome') {
      valA = nomeMil(a.solicitanteId).toLowerCase();
      valB = nomeMil(b.solicitanteId).toLowerCase();
    } else if (sortField === 'receptor') {
      valA = nomeMil(a.receptorId).toLowerCase();
      valB = nomeMil(b.receptorId).toLowerCase();
    } else if (sortField === 'criadoEm') {
      valA = a.criadoEm || '';
      valB = b.criadoEm || '';
    } else if (sortField === 'tipo') {
      valA = a.tipo || '';
      valB = b.tipo || '';
    } else if (sortField === 'status') {
      valA = a.status || '';
      valB = b.status || '';
    }

    if (valA < valB) return sortAsc ? -1 : 1;
    if (valA > valB) return sortAsc ? 1 : -1;
    return 0;
  });

  const relFiltrado = sortedPermutas.filter(p =>
    nomeMil(p.solicitanteId).toLowerCase().includes(buscaRel.toLowerCase()) ||
    nomeMil(p.receptorId).toLowerCase().includes(buscaRel.toLowerCase())
  );

  function handleExportarCSV() {
    const headers = [
      'Data de Servico',
      'Data de Retorno',
      'Solicitante',
      'Receptor',
      'Data de Solicitacao',
      'Tipo de Permuta',
      'Status',
      'Motivo Rejeicao',
      'Observacao'
    ];

    const rows = relFiltrado.map(p => [
      p.data,
      p.dataRetorno || '—',
      nomeMil(p.solicitanteId),
      nomeMil(p.receptorId),
      p.criadoEm ? fmtDateTime(p.criadoEm) : '—',
      p.tipo === 'paga' ? 'Permuta Simples' : 'Permuta Dupla',
      p.status,
      p.motivoRejeicao || '—',
      p.obs || '—'
    ]);

    const csvContent = [
      headers.join(';'),
      ...rows.map(r => r.map(val => `"${val.replace(/"/g, '""')}"`).join(';'))
    ].join('\n');

    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `relatorio_permutas_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function handleExportarXLSX() {
    const dataToExport = relFiltrado.map(p => ({
      'Data do Serviço': p.data,
      'Data de Retorno': p.dataRetorno || '—',
      'Solicitante': nomeMil(p.solicitanteId),
      'Receptor': nomeMil(p.receptorId),
      'Data da Solicitação': p.criadoEm ? fmtDateTime(p.criadoEm) : '—',
      'Tipo de Permuta': p.tipo === 'paga' ? 'Permuta Simples' : 'Permuta Dupla',
      'Status': p.status,
      'Motivo Rejeição / Observações': p.motivoRejeicao || p.obs || '—'
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Permutas');

    const maxLens = {};
    dataToExport.forEach(row => {
      Object.keys(row).forEach(key => {
        const val = String(row[key] || '');
        maxLens[key] = Math.max(maxLens[key] || 10, val.length);
      });
    });
    worksheet['!cols'] = Object.keys(maxLens).map(key => ({ wch: maxLens[key] + 3 }));

    XLSX.writeFile(workbook, `relatorio_permutas_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  function handleExportarPDF() {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFont('Helvetica', 'bold');
    doc.text('CBMERJ · 4º GMar · Relatório de Permutas', 14, 15);
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}`, 14, 20);

    const tableHeaders = [
      ['Data Sv', 'Retorno', 'Solicitante', 'Receptor', 'Solicitado Em', 'Tipo', 'Status']
    ];

    const tableData = relFiltrado.map(p => [
      fmtData(p.data),
      p.dataRetorno ? fmtData(p.dataRetorno) : '—',
      nomeMil(p.solicitanteId),
      nomeMil(p.receptorId),
      p.criadoEm ? fmtDateTime(p.criadoEm) : '—',
      p.tipo === 'paga' ? 'Simples' : 'Dupla',
      p.status
    ]);

    autoTable(doc, {
      head: tableHeaders,
      body: tableData,
      startY: 25,
      theme: 'grid',
      headStyles: { fillColor: [143, 0, 0] },
      styles: { fontSize: 8, font: 'Helvetica' },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 22 },
        2: { cellWidth: 70 },
        3: { cellWidth: 70 },
        4: { cellWidth: 35 },
        5: { cellWidth: 25 },
        6: { cellWidth: 30 }
      }
    });

    doc.save(`relatorio_permutas_${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  function badgeStatus(p) {
    const s = p.status;
    const isCancelada = s === 'rejeitada' && (p.aprovadoEm || p.quitadoEm);
    const map = {
      aguardando_confirmacao: ['⏳', '#f0a050', C.laranjaPale, 'Ag. Confirmação'],
      aguardando_aprovacao: ['🔍', C.ouroClaro, C.ouroPale, 'Ag. Aprovação'],
      aprovada: ['✅', '#7dbd72', C.verdePale, 'Aprovada'],
      rejeitada: isCancelada ? ['🚫', '#e74c3c', C.vermelhoPale, 'Cancelada'] : ['❌', '#e07070', C.vermelhoPale, 'Rejeitada'],
      quitada: ['🏁', '#e07070', 'rgba(122,138,106,.15)', 'Quitada'],
    };
    const [ico, cor, bg, txt] = map[s] || ['?', C.cinza, 'transparent', s];
    return <span style={{ background: bg, color: cor, border: `1px solid ${cor}40`, borderRadius: 4, padding: '2px 8px', fontSize: '0.65rem', fontFamily: "'Montserrat', sans-serif", fontWeight: 700 }}>{ico} {txt}</span>;
  }

  const permFiltradas = permutas.filter(p =>
    nomeMil(p.solicitanteId).toLowerCase().includes(busca.toLowerCase()) ||
    nomeMil(p.receptorId).toLowerCase().includes(busca.toLowerCase())
  );

  return (
    <div style={{ minHeight: '100vh', background: C.fundo, color: C.creme, fontFamily: "'Montserrat', sans-serif" }}>
      {/* HEADER */}
      <div style={{ background: C.fundo2, borderBottom: `2px solid ${C.borda}`, padding: '0.9rem 1.2rem', display: 'flex', alignItems: 'center', gap: '0.8rem', position: 'sticky', top: 0, zIndex: 100, flexWrap: 'wrap' }}>
        <img src="/heraldica_gmar.png" alt="Logo GMar" style={{ width: 40, height: 40, objectFit: 'contain', filter: 'drop-shadow(0 0 8px rgba(255,255,255,0.3))' }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '1.2rem', letterSpacing: 3 }}>CBMERJ · 4º GMar · Admin</div>
          <div style={{ fontFamily: "'Montserrat', sans-serif", fontSize: '0.6rem', fontWeight: 600, color: C.ouro, letterSpacing: 2 }}>{perfil?.nome}</div>
        </div>
        <input type="month" value={mesRef} onChange={e => { setMesRef(e.target.value); setMesSaldoSel(e.target.value); }}
          style={{ background: 'rgba(0,0,0,.3)', border: `1px solid ${C.borda}`, borderRadius: 6, color: C.ouro, fontFamily: 'monospace', fontSize: '0.75rem', padding: '0.35rem 0.6rem', outline: 'none' }} />
        <button onClick={logout} style={{ background: 'transparent', border: `1px solid ${C.borda}`, color: C.cinza, borderRadius: 6, padding: '0.35rem 0.7rem', cursor: 'pointer', fontSize: '0.7rem', fontFamily: 'monospace', transition: 'all 0.2s' }}>SAIR</button>
      </div>

      {/* NAV */}
      <div style={{ background: C.fundo2, borderBottom: `1px solid ${C.borda}`, padding: '0 1rem', display: 'flex', gap: 0, overflowX: 'auto' }}>
        {[['dashboard', '📊 Painel'], ['aprovar', '🔍 Aprovar' + (pendAprov.length > 0 ? ` (${pendAprov.length})` : '')], ['permutas', '📋 Permutas'], ['militares', '👤 Militares'], ['limites', '⚠️ Limites'], ['relatorio', '📈 Relatório']].map(([k, v]) => (
          <button key={k} onClick={() => setAba(k)} style={{ background: 'transparent', border: 'none', borderBottom: aba === k ? `2px solid ${C.vermelho}` : '2px solid transparent', color: aba === k ? C.vermelhoClaro : C.cinza, padding: '0.8rem 1rem', cursor: 'pointer', fontFamily: "'Montserrat', sans-serif", fontSize: '0.68rem', fontWeight: aba === k ? 700 : 400, letterSpacing: 1, whiteSpace: 'nowrap', marginBottom: -1, transition: 'all 0.2s' }}>
            {v}
          </button>
        ))}
      </div>

      <div style={{ padding: '1.2rem', maxWidth: 1200, margin: '0 auto' }}>

        {/* ── DASHBOARD ── */}
        {aba === 'dashboard' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: '0.8rem', marginBottom: '1.2rem' }}>
              {[
                ['Militares', militares.length, C.ouro, 'cadastrados'],
                ['Ag. Aprovação', pendAprov.length, '#f0a050', 'permutas'],
                ['Ag. Confirmação', pendConf.length, '#3498db', 'permutas'],
                ['No Limite', noLimite.length, '#e07070', fmtMes(mesRef)],
              ].map(([l, n, cor, sub]) => (
                <div key={l} style={{ background: C.fundo2, border: `1px solid ${C.borda}`, borderRadius: 10, padding: '1rem 1.2rem', position: 'relative', overflow: 'hidden', boxShadow: '0 4px 15px rgba(0,0,0,0.2)' }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,${cor},transparent)` }} />
                  <div style={{ fontFamily: 'monospace', fontSize: '0.6rem', letterSpacing: 2, color: C.cinza, marginBottom: '0.3rem', textTransform: 'uppercase' }}>{l}</div>
                  <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '2.8rem', color: cor, lineHeight: 1 }}>{n}</div>
                  <div style={{ fontSize: '0.75rem', color: C.cinza, fontStyle: 'italic' }}>{sub}</div>
                </div>
              ))}
            </div>

            {pendAprov.length > 0 && (
              <div style={{ background: C.ouroPale, border: `1px solid ${C.borda}`, borderRadius: 10, padding: '1rem 1.2rem', marginBottom: '1rem', boxShadow: '0 4px 15px rgba(0,0,0,0.2)' }}>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '1.1rem', letterSpacing: 2, color: C.fundo2, marginBottom: '0.8rem' }}>🔍 Aguardando sua Aprovação</div>
                {pendAprov.map(p => (
                  <div key={p.id} style={{ color: C.fundo2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.6rem 0', borderBottom: `1px solid ${C.borda}`, flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div>
                      <span style={{ fontWeight: 600 }}>{nomeMil(p.solicitanteId)}</span>
                      <span style={{ color: C.fundo2 }}> → </span>
                      <span style={{ fontWeight: 600 }}>{nomeMil(p.receptorId)}</span>
                      <span style={{ color: C.fundo2, fontFamily: 'monospace', fontSize: '0.78rem', marginLeft: '0.5rem', fontWeight: 600 }}>
                        {p.tipo === 'real' ? `${fmtData(p.data)} ⇆ ${fmtData(p.dataRetorno)}` : fmtData(p.data)} · {p.tipo === 'paga' ? 'PERMUTA SIMPLES' : '🤝 PERMUTA DUPLA'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button onClick={() => { setPermutaSel(p); setModal('aprovar'); setMotivo(''); }} style={{ background: C.verdePale, color: '#7dbd72', border: `1px solid ${C.verde}40`, borderRadius: 6, padding: '0.3rem 0.7rem', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.65rem', fontWeight: 700, transition: 'all 0.2s' }}>✅ APROVAR</button>
                      <button onClick={() => { setPermutaSel(p); setModal('rejeitar'); setMotivo(''); }} style={{ background: C.vermelhoPale, color: '#e07070', border: `1px solid ${C.vermelho}40`, borderRadius: 6, padding: '0.3rem 0.7rem', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.65rem', fontWeight: 700, transition: 'all 0.2s' }}>❌ REJEITAR</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Saldos reais */}
            <div style={{ background: C.fundo2, border: `1px solid ${C.borda}`, borderRadius: 10, padding: '1rem 1.2rem', boxShadow: '0 4px 15px rgba(0,0,0,0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.8rem', gap: '0.5rem', flexWrap: 'wrap' }}>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '1.1rem', letterSpacing: 2, color: C.ouro }}>💳 Saldo Permutas Simples (Apenas Permutas Simples acumulam dívida)</div>
                <select value={mesSaldoSel} onChange={e => setMesSaldoSel(e.target.value)}
                  style={{ background: 'rgba(0,0,0,.3)', border: `1px solid ${C.borda}`, borderRadius: 6, color: C.ouro, fontFamily: 'monospace', fontSize: '0.75rem', padding: '0.3rem 0.5rem', outline: 'none' }}>
                  {Array.from(new Set([mesRef, ...mesesComSaldo])).map(m => (
                    <option key={m} value={m} style={{ background: '#2c3e50', color: '#fff' }}>{fmtMes(m)}</option>
                  ))}
                </select>
              </div>

              {(() => {
                const militarSaldoList = militares.filter(m => saldoRealNoMes(m.id, mesSaldoSel) !== 0);
                if (militarSaldoList.length === 0) {
                  return <div style={{ color: C.cinza, fontStyle: 'italic', fontSize: '0.9rem' }}>Todos os saldos zerados em {fmtMes(mesSaldoSel)} ✅</div>;
                }
                return militarSaldoList.map(m => {
                  const s = saldoRealNoMes(m.id, mesSaldoSel);
                  return (
                    <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: `1px solid ${C.borda}`, fontSize: '0.9rem' }}>
                      <span>RG {m.rg} {m.posto} {m.nome}</span>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, color: s > 0 ? '#7dbd72' : '#e07070' }}>
                        {s > 0 ? `+${s} a receber` : `${s} a devolver`}
                      </span>
                    </div>
                  );
                });
              })()}
            </div>
          </>
        )}

        {/* ── APROVAR ── */}
        {aba === 'aprovar' && (
          <div style={{ background: C.fundo2, border: `1px solid ${C.borda}`, borderRadius: 10, padding: '1rem 1.2rem', boxShadow: '0 4px 15px rgba(0,0,0,0.2)' }}>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '1.2rem', letterSpacing: 2, color: C.ouro, marginBottom: '1rem' }}>🔍 Permutas Aguardando Aprovação</div>
            {pendAprov.length === 0
              ? <div style={{ textAlign: 'center', padding: '2rem', color: C.fundo2 }}><div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>✅</div><div style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>Nenhuma pendente</div></div>
              : pendAprov.map(p => (
                <div key={p.id} style={{ background: 'rgba(0,0,0,.2)', borderRadius: 10, padding: '1rem', marginBottom: '0.8rem', border: `1px solid ${C.borda}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.3rem' }}>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <span style={{ background: p.tipo === 'paga' ? C.laranjaPale : C.ouroPale, color: p.tipo === 'paga' ? '#f0a050' : C.ouro, border: `1px solid ${p.tipo === 'paga' ? C.laranja : C.ouro}40`, borderRadius: 4, padding: '1px 7px', fontSize: '0.65rem', fontFamily: 'monospace', fontWeight: 700 }}>{p.tipo === 'paga' ? 'PERMUTA SIMPLES' : '🤝 PERMUTA DUPLA'}</span>
                      {badgeStatus(p)}
                    </div>
                    <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: C.ouro, fontWeight: 600 }}>
                      {p.tipo === 'real' ? `${fmtData(p.data)} ⇆ ${fmtData(p.dataRetorno)}` : fmtData(p.data)}
                    </span>
                  </div>
                  <div style={{ marginBottom: '0.3rem', fontSize: '0.95rem' }}><strong>{nomeMil(p.solicitanteId)}</strong><span style={{ color: C.cinza }}> → </span><strong>{nomeMil(p.receptorId)}</strong></div>
                  <div style={{ fontSize: '0.8rem', color: C.cinza, fontFamily: 'monospace', marginBottom: '0.6rem' }}>{p.tipoSv} · {p.mes}{p.obsConfirmacao ? ' · "' + p.obsConfirmacao + '"' : ''}</div>
                  {p.obs && <div style={{ fontSize: '0.82rem', color: C.cinza, fontStyle: 'italic', marginBottom: '0.6rem', borderLeft: `2px solid ${C.ouroClaro}`, paddingLeft: 6 }}>📝 {p.obs}</div>}
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button onClick={() => { setPermutaSel(p); setModal('aprovar'); }} style={{ flex: 1, background: C.verdePale, color: '#7dbd72', border: `1px solid ${C.verde}40`, borderRadius: 6, padding: '0.5rem', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.7rem', fontWeight: 700, transition: 'all 0.2s' }}>✅ APROVAR</button>
                    <button onClick={() => { setPermutaSel(p); setModal('rejeitar'); setMotivo(''); }} style={{ flex: 1, background: C.vermelhoPale, color: '#e07070', border: `1px solid ${C.vermelho}40`, borderRadius: 6, padding: '0.5rem', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.7rem', fontWeight: 700, transition: 'all 0.2s' }}>❌ REJEITAR</button>
                  </div>
                </div>
              ))
            }
          </div>
        )}

        {/* ── PERMUTAS ── */}
        {aba === 'permutas' && (
          <div style={{ background: C.fundo2, border: `1px solid ${C.borda}`, borderRadius: 10, padding: '1rem 1.2rem', boxShadow: '0 4px 15px rgba(0,0,0,0.2)' }}>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '1.2rem', letterSpacing: 2, color: C.ouro, marginBottom: '1rem' }}>📋 Todas as Permutas</div>
            <input type="text" placeholder="🔍  Buscar por nome..." value={busca} onChange={e => setBusca(e.target.value)}
              style={{ width: '100%', background: 'rgba(0,0,0,.3)', border: `1px solid ${C.borda}`, borderRadius: 8, color: C.creme, fontFamily: 'monospace', fontSize: '0.9rem', padding: '0.6rem 0.9rem', marginBottom: '1rem', boxSizing: 'border-box', outline: 'none' }} />
            {permFiltradas.map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.7rem 0', borderBottom: `1px solid ${C.borda}`, flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.2rem', flexWrap: 'wrap' }}>
                    <span style={{ background: p.tipo === 'paga' ? C.laranjaPale : C.ouroPale, color: p.tipo === 'paga' ? '#f0a050' : C.ouro, border: `1px solid ${p.tipo === 'paga' ? C.laranja : C.ouro}40`, borderRadius: 4, padding: '1px 6px', fontSize: '0.62rem', fontFamily: 'monospace', fontWeight: 700 }}>{p.tipo === 'paga' ? 'PERMUTA SIMPLES' : '🤝 PERMUTA DUPLA'}</span>
                    {badgeStatus(p)}
                    <span style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: C.ouro, fontWeight: 600 }}>
                      {p.tipo === 'real' ? `${fmtData(p.data)} ⇆ ${fmtData(p.dataRetorno)}` : fmtData(p.data)}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.9rem' }}><strong>{nomeMil(p.solicitanteId)}</strong><span style={{ color: C.cinza }}> → </span><strong>{nomeMil(p.receptorId)}</strong></div>
                </div>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  {p.status === 'aguardando_aprovacao' && <>
                    <button onClick={() => { setPermutaSel(p); setModal('aprovar'); }} style={{ background: C.verdePale, color: '#7dbd72', border: `1px solid ${C.verde}40`, borderRadius: 5, padding: '0.3rem 0.6rem', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.62rem', fontWeight: 700, transition: 'all 0.2s' }}>✅</button>
                    <button onClick={() => { setPermutaSel(p); setModal('rejeitar'); setMotivo(''); }} style={{ background: C.vermelhoPale, color: '#e07070', border: `1px solid ${C.vermelho}40`, borderRadius: 5, padding: '0.3rem 0.6rem', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.62rem', fontWeight: 700, transition: 'all 0.2s' }}>❌</button>
                  </>}
                  {p.status === 'aprovada' && p.tipo === 'real' && <button onClick={() => { setPermutaSel(p); setModal('quitar'); setMotivo(''); }} style={{ background: 'rgba(122,138,106,.15)', color: C.cinza, border: `1px solid ${C.cinza}40`, borderRadius: 5, padding: '0.3rem 0.6rem', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.62rem', fontWeight: 700, transition: 'all 0.2s' }}>🏁 Quitar</button>}
                  {(p.status === 'aprovada' || p.status === 'quitada') && <button onClick={() => { setPermutaSel(p); setModal('cancelar'); setMotivo(''); }} style={{ background: C.vermelhoPale, color: '#f0a050', border: `1px solid ${C.vermelho}40`, borderRadius: 5, padding: '0.3rem 0.6rem', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.62rem', fontWeight: 700, transition: 'all 0.2s' }}>🚫 Cancelar</button>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── MILITARES ── */}
        {aba === 'militares' && (
          <>
            <div style={{ background: C.fundo2, border: `1px solid ${C.borda}`, borderRadius: 10, padding: '1rem 1.2rem', marginBottom: '1rem', boxShadow: '0 4px 15px rgba(0,0,0,0.2)' }}>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '1.1rem', letterSpacing: 2, color: C.fundo2, marginBottom: '1rem', borderBottom: `1px solid ${C.borda}`, paddingBottom: 6 }}>➕ Cadastrar Militar + Acesso</div>
              <form onSubmit={handleAddMilitar}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: '0.8rem' }}>
                  {[['m-posto', 'Posto', 'select'], ['m-nome', 'Nome de Guerra', 'text'], ['m-rg', 'RG', 'text'], ['m-regime', 'Regime', 'select'], ['m-secao', 'Seção/Função', 'text'], ['m-senha', 'Senha Inicial', 'password']].map(([id, lbl, tipo]) => (
                    <div key={id}>
                      <label style={{ display: 'block', fontFamily: 'monospace', fontSize: '0.58rem', letterSpacing: 2, color: C.ouro, marginBottom: '0.3rem', textTransform: 'uppercase' }}>{lbl}{['m-posto', 'm-nome', 'm-rg', 'm-senha'].includes(id) ? '*' : ''}</label>
                      {tipo === 'select' ? (
                        <select value={id === 'm-posto' ? formMil.posto : formMil.regime} onChange={e => setFormMil(f => ({ ...f, [id === 'm-posto' ? 'posto' : 'regime']: e.target.value }))}
                          style={controlStyle}>
                          {id === 'm-posto'
                            ? ['', 'Sd', 'Cb', '3º Sgt', '2º Sgt', '1º Sgt', 'ST', 'SUBTEN', '2º Ten', '1º Ten', 'Cap', 'Maj', 'TC', 'Cel'].map(v => <option key={v} value={v}>{v || 'Selecione...'}</option>)
                            : [['12h', '12h (12x60)'], ['24h', '24h (24x72)'], ['exp', 'Expediente']].map(([v, l]) => <option key={v} value={v}>{l}</option>)
                          }
                        </select>
                      ) : (
                        <input type={tipo} placeholder={id === 'm-rg' ? 'Ex: 43842' : id === 'm-senha' ? 'Mín. 6 caracteres' : ''} value={formMil[id === 'm-nome' ? 'nome' : id === 'm-rg' ? 'rg' : id === 'm-secao' ? 'secao' : 'senha']} onChange={e => setFormMil(f => ({ ...f, [id === 'm-nome' ? 'nome' : id === 'm-rg' ? 'rg' : id === 'm-secao' ? 'secao' : 'senha']: e.target.value }))}
                          style={controlStyle} />
                      )}
                    </div>
                  ))}
                </div>
                <button type="submit" style={{ marginTop: '0.8rem', background: C.ouro, color: C.fundo2, border: 'none', borderRadius: 8, padding: '0.7rem 1.5rem', fontFamily: 'monospace', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer', letterSpacing: 1, boxShadow: '0 4px 15px rgba(0,210,255,0.3)', transition: 'all 0.2s' }}>✚ CADASTRAR</button>
              </form>
            </div>

            <div style={{ background: C.fundo2, border: `1px solid ${C.borda}`, borderRadius: 10, padding: '1rem 1.2rem', boxShadow: '0 4px 15px rgba(0,0,0,0.2)' }}>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '1.1rem', letterSpacing: 2, color: C.ouro, marginBottom: '0.8rem' }}>👤 Militares Cadastrados ({militares.length})</div>
              {militares.map(m => (
                <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0', borderBottom: `1px solid ${C.borda}`, flexWrap: 'wrap', gap: '0.3rem' }}>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: '0.95rem', color: C.creme }}>RG {m.rg} {m.posto} {m.nome}</span>
                    {m.ativo === false ? (
                      <span style={{ background: 'rgba(224,112,112,0.15)', color: '#e07070', borderRadius: 3, padding: '1px 5px', fontFamily: 'monospace', fontSize: '0.65rem', marginLeft: '0.5rem', fontWeight: 700 }}>🔴 INATIVO</span>
                    ) : (
                      <span style={{ background: 'rgba(125,189,114,0.15)', color: '#7dbd72', borderRadius: 3, padding: '1px 5px', fontFamily: 'monospace', fontSize: '0.65rem', marginLeft: '0.5rem', fontWeight: 700 }}>🟢 ATIVO</span>
                    )}
                    <div style={{ fontSize: '0.78rem', color: C.cinza }}>{m.secao || '—'} · <span style={{ background: 'rgba(41,128,185,0.15)', color: C.ouro, borderRadius: 3, padding: '1px 5px', fontFamily: 'monospace', fontSize: '0.65rem' }}>{m.regime}</span></div>
                  </div>
                  <div>
                    <button onClick={() => { setMilitarSel(m); setFormEdit({ posto: m.posto, nome: m.nome, rg: m.rg, regime: m.regime, secao: m.secao || '', ativo: m.ativo !== false, senha: '' }); setModal('editar_militar'); }}
                      style={{ background: 'rgba(255,255,255,0.05)', color: C.ouro, border: `1px solid ${C.borda}`, borderRadius: 6, padding: '0.35rem 0.7rem', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.65rem', fontWeight: 700, transition: 'all 0.2s' }}>
                      ✏️ EDITAR
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── LIMITES ── */}
        {aba === 'limites' && (
          <div style={{ background: C.fundo2, border: `1px solid ${C.borda}`, borderRadius: 10, padding: '1rem 1.2rem', boxShadow: '0 4px 15px rgba(0,0,0,0.2)' }}>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '1.1rem', letterSpacing: 2, color: C.ouro, marginBottom: '0.3rem' }}>⚠️ Limites — {fmtMes(mesRef)}</div>
            <p style={{ fontSize: '0.85rem', color: C.cinza, fontStyle: 'italic', marginBottom: '1rem' }}>Ajuste os serviços impostos de cada militar neste mês. O limite da permuta simples é calculado automaticamente (50%).</p>
            {militares.map(m => {
              const svs = svsMilMes(m.id); const lim = limitePago(m.id); const pag = jaPageiMes(m.id);
              const pct = lim > 0 ? Math.min(100, Math.round(pag / lim * 100)) : 0;
              const cor = pct >= 100 ? '#e07070' : pct >= 75 ? '#f0a050' : '#7dbd72';
              return <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', padding: '0.7rem 0', borderBottom: `1px solid ${C.borda}`, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', color: C.creme }}>RG {m.rg} {m.posto} {m.nome}</div>
                  <div style={{ fontSize: '0.75rem', color: C.cinza, fontFamily: 'monospace' }}>{m.regime} · {pag}/{lim} pagos</div>
                  <div style={{ height: 4, background: 'rgba(255,255,255,.1)', borderRadius: 2, width: 100, marginTop: 4, overflow: 'hidden' }}><div style={{ height: '100%', background: cor, width: `${pct}%`, borderRadius: 2 }} /></div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <label style={{ fontFamily: 'monospace', fontSize: '0.6rem', color: C.ouro, textTransform: 'uppercase' }}>Svs:</label>
                  <input type="number" min="0" max="31" defaultValue={svs} onBlur={e => handleSetSvs(m.id, e.target.value)}
                    style={{ width: 55, background: 'rgba(0,0,0,.3)', border: `1px solid ${C.borda}`, borderRadius: 5, color: C.creme, fontFamily: 'monospace', fontSize: '0.9rem', padding: '0.3rem 0.4rem', textAlign: 'center', outline: 'none' }} />
                  <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: cor, fontWeight: 700 }}>Lim:{lim}</span>
                </div>
              </div>;
            })}
          </div>
        )}

        {/* ── RELATÓRIO ── */}
        {aba === 'relatorio' && (
          <div style={{ background: C.fundo2, border: `1px solid ${C.borda}`, borderRadius: 10, padding: '1rem 1.2rem', boxShadow: '0 4px 15px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.8rem' }}>
              <div>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '1.2rem', letterSpacing: 2, color: C.ouro }}>📈 Relatório de Permutas</div>
                <div style={{ fontSize: '0.75rem', color: C.cinza }}>Consulte, ordene e exporte o histórico de todas as permutas.</div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button onClick={handleExportarCSV} style={{ background: 'rgba(52, 152, 219, 0.15)', color: '#3498db', border: '1px solid rgba(52, 152, 219, 0.4)', borderRadius: 6, padding: '0.4rem 0.8rem', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.68rem', fontWeight: 700, transition: 'all 0.2s' }}>
                  📥 EXPORTAR CSV
                </button>
                <button onClick={handleExportarXLSX} style={{ background: 'rgba(46, 204, 113, 0.15)', color: '#2ecc71', border: '1px solid rgba(46, 204, 113, 0.4)', borderRadius: 6, padding: '0.4rem 0.8rem', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.68rem', fontWeight: 700, transition: 'all 0.2s' }}>
                  📥 EXPORTAR XLSX
                </button>
                <button onClick={handleExportarPDF} style={{ background: 'rgba(231, 76, 60, 0.15)', color: '#e74c3c', border: '1px solid rgba(231, 76, 60, 0.4)', borderRadius: 6, padding: '0.4rem 0.8rem', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.68rem', fontWeight: 700, transition: 'all 0.2s' }}>
                  📥 EXPORTAR PDF
                </button>
              </div>
            </div>

            <input type="text" placeholder="🔍 Buscar por nome ou RG..." value={buscaRel} onChange={e => setBuscaRel(e.target.value)}
              style={{ width: '100%', background: 'rgba(0,0,0,.3)', border: `1px solid ${C.borda}`, borderRadius: 8, color: C.creme, fontFamily: 'monospace', fontSize: '0.9rem', padding: '0.6rem 0.9rem', marginBottom: '1rem', boxSizing: 'border-box', outline: 'none' }} />

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', fontFamily: 'monospace', color: C.creme }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${C.borda}`, textAlign: 'left' }}>
                    {[
                      ['data', 'Data Sv'],
                      ['nome', 'Solicitante'],
                      ['receptor', 'Receptor'],
                      ['criadoEm', 'Solicitado Em'],
                      ['tipo', 'Tipo'],
                      ['status', 'Status']
                    ].map(([field, label]) => {
                      const isSorted = sortField === field;
                      return (
                        <th key={field} onClick={() => handleSort(field)} style={{ padding: '0.7rem 0.5rem', cursor: 'pointer', userSelect: 'none', color: isSorted ? C.ouro : C.cinza }}>
                          {label} {isSorted ? (sortAsc ? '▲' : '▼') : ''}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {relFiltrado.map(p => (
                    <tr key={p.id} style={{ borderBottom: `1px solid ${C.borda}` }}>
                      <td style={{ padding: '0.6rem 0.5rem' }}>
                        {p.tipo === 'real' ? `${fmtData(p.data)} a ${fmtData(p.dataRetorno)}` : fmtData(p.data)}
                      </td>
                      <td style={{ padding: '0.6rem 0.5rem', fontWeight: 600 }}>{nomeMil(p.solicitanteId)}</td>
                      <td style={{ padding: '0.6rem 0.5rem', fontWeight: 600 }}>{nomeMil(p.receptorId)}</td>
                      <td style={{ padding: '0.6rem 0.5rem' }}>{fmtDateTime(p.criadoEm)}</td>
                      <td style={{ padding: '0.6rem 0.5rem' }}>
                        <span style={{ background: p.tipo === 'paga' ? C.laranjaPale : C.ouroPale, color: p.tipo === 'paga' ? '#f0a050' : C.ouro, border: `1px solid ${p.tipo === 'paga' ? C.laranja : C.ouro}40`, borderRadius: 4, padding: '1px 5px', fontSize: '0.6rem', fontWeight: 700 }}>
                          {p.tipo === 'paga' ? 'SIMPLES' : 'DUPLA'}
                        </span>
                      </td>
                      <td style={{ padding: '0.6rem 0.5rem' }}>
                        {badgeStatus(p)}
                      </td>
                    </tr>
                  ))}
                  {relFiltrado.length === 0 && (
                    <tr>
                      <td colSpan="6" style={{ padding: '2rem', textAlign: 'center', color: C.cinza }}>
                        Nenhuma permuta encontrada.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>

      {/* MODAIS */}
      {
        modal === 'aprovar' && permutaSel && (
          <ModalBg onClose={() => setModal(null)}>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '1.3rem', letterSpacing: 2, color: '#7dbd72', marginBottom: '0.8rem', borderBottom: `1px solid ${C.borda}`, paddingBottom: 6 }}>✅ Aprovar Permuta</div>
            <div style={{ background: 'rgba(0,0,0,.2)', borderRadius: 8, borderLeft: `3px solid ${C.vermelho}`, padding: '0.7rem', marginBottom: '1rem', fontSize: '0.9rem', color: C.cinza }}>
              <strong>{nomeMil(permutaSel.solicitanteId)}</strong> → <strong>{nomeMil(permutaSel.receptorId)}</strong><br />
              <div style={{ marginTop: 4, color: C.ouro, fontWeight: 600 }}>
                {permutaSel.tipo === 'real' ? `${fmtData(permutaSel.data)} ⇆ ${fmtData(permutaSel.dataRetorno)}` : fmtData(permutaSel.data)} · {permutaSel.tipoSv} · {permutaSel.tipo === 'paga' ? 'Permuta Simples' : 'Permuta Dupla'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <button onClick={() => setModal(null)} style={{ flex: 1, background: 'transparent', color: C.cinza, border: `1px solid ${C.borda}`, borderRadius: 8, padding: '0.7rem', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.72rem' }}>CANCELAR</button>
              <button onClick={handleAprovar} style={{ flex: 2, background: C.verdePale, color: '#7dbd72', border: `1px solid ${C.verde}40`, borderRadius: 8, padding: '0.7rem', cursor: 'pointer', fontFamily: 'monospace', fontWeight: 700, fontSize: '0.72rem' }}>✅ CONFIRMAR APROVAÇÃO</button>
            </div>
          </ModalBg>
        )
      }

      {
        modal === 'rejeitar' && permutaSel && (
          <ModalBg onClose={() => setModal(null)}>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '1.3rem', letterSpacing: 2, color: '#e07070', marginBottom: '0.8rem', borderBottom: `1px solid ${C.borda}`, paddingBottom: 6 }}>❌ Rejeitar Permuta</div>
            <label style={{ display: 'block', fontFamily: 'monospace', fontSize: '0.6rem', letterSpacing: 2, color: C.ouro, marginBottom: '0.3rem', textTransform: 'uppercase' }}>Motivo</label>
            <textarea value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Informe o motivo da rejeição..."
              style={{ width: '100%', background: 'rgba(0,0,0,.35)', border: `1px solid ${C.borda}`, borderRadius: 8, color: C.creme, fontFamily: 'monospace', fontSize: '0.9rem', padding: '0.65rem', minHeight: 70, resize: 'vertical', boxSizing: 'border-box', marginBottom: '1rem', outline: 'none' }} />
            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <button onClick={() => setModal(null)} style={{ flex: 1, background: 'transparent', color: C.cinza, border: `1px solid ${C.borda}`, borderRadius: 8, padding: '0.7rem', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.72rem' }}>CANCELAR</button>
              <button onClick={handleRejeitar} style={{ flex: 2, background: C.vermelhoPale, color: '#e07070', border: `1px solid ${C.vermelho}40`, borderRadius: 8, padding: '0.7rem', cursor: 'pointer', fontFamily: 'monospace', fontWeight: 700, fontSize: '0.72rem' }}>❌ REJEITAR</button>
            </div>
          </ModalBg>
        )
      }

      {
        modal === 'quitar' && permutaSel && (
          <ModalBg onClose={() => setModal(null)}>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '1.3rem', letterSpacing: 2, color: C.cinza, marginBottom: '0.8rem', borderBottom: `1px solid ${C.borda}`, paddingBottom: 6 }}>🏁 Quitar Permuta Dupla</div>
            <div style={{ background: 'rgba(0,0,0,.2)', borderRadius: 8, borderLeft: `3px solid ${C.vermelho}`, padding: '0.7rem', marginBottom: '1rem', fontSize: '0.9rem', color: C.cinza }}>
              <strong>{nomeMil(permutaSel.solicitanteId)}</strong> deu o serviço em {fmtData(permutaSel.data)} para <strong>{nomeMil(permutaSel.receptorId)}</strong> (Retorno em {fmtData(permutaSel.dataRetorno)}). A dívida foi quitada?
            </div>
            <label style={{ display: 'block', fontFamily: 'monospace', fontSize: '0.6rem', letterSpacing: 2, color: C.ouro, marginBottom: '0.3rem', textTransform: 'uppercase' }}>Observação</label>
            <textarea value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex: Quitado em mai/2026..."
              style={{ width: '100%', background: 'rgba(0,0,0,.35)', border: `1px solid ${C.borda}`, borderRadius: 8, color: C.creme, fontFamily: 'monospace', fontSize: '0.9rem', padding: '0.65rem', minHeight: 60, resize: 'vertical', boxSizing: 'border-box', marginBottom: '1rem', outline: 'none' }} />
            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <button onClick={() => setModal(null)} style={{ flex: 1, background: 'transparent', color: C.cinza, border: `1px solid ${C.borda}`, borderRadius: 8, padding: '0.7rem', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.72rem' }}>CANCELAR</button>
              <button onClick={handleQuitar} style={{ flex: 2, background: C.verdePale, color: '#7dbd72', border: `1px solid ${C.verde}40`, borderRadius: 8, padding: '0.7rem', cursor: 'pointer', fontFamily: 'monospace', fontWeight: 700, fontSize: '0.72rem' }}>🏁 QUITAR</button>
            </div>
          </ModalBg>
        )
      }

      {
        modal === 'cancelar' && permutaSel && (
          <ModalBg onClose={() => setModal(null)}>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '1.3rem', letterSpacing: 2, color: '#e07070', marginBottom: '0.8rem', borderBottom: `1px solid ${C.borda}`, paddingBottom: 6 }}>🚫 Cancelar Permuta</div>
            <div style={{ background: 'rgba(0,0,0,.2)', borderRadius: 8, borderLeft: `3px solid ${C.vermelho}`, padding: '0.7rem', marginBottom: '1rem', fontSize: '0.9rem', color: C.cinza }}>
              <strong>{nomeMil(permutaSel.solicitanteId)}</strong> → <strong>{nomeMil(permutaSel.receptorId)}</strong><br />
              <div style={{ marginTop: 4, color: C.ouro, fontWeight: 600 }}>
                {permutaSel.tipo === 'real' ? `${fmtData(permutaSel.data)} ⇆ ${fmtData(permutaSel.dataRetorno)}` : fmtData(permutaSel.data)} · {permutaSel.tipoSv} · {permutaSel.tipo === 'paga' ? 'Permuta Simples' : 'Permuta Dupla'}
              </div>
            </div>
            <label style={{ display: 'block', fontFamily: 'monospace', fontSize: '0.6rem', letterSpacing: 2, color: C.ouro, marginBottom: '0.3rem', textTransform: 'uppercase' }}>Motivo do Cancelamento</label>
            <textarea value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Informe o motivo do cancelamento..."
              style={{ width: '100%', background: 'rgba(0,0,0,.35)', border: `1px solid ${C.borda}`, borderRadius: 8, color: C.creme, fontFamily: 'monospace', fontSize: '0.9rem', padding: '0.65rem', minHeight: 70, resize: 'vertical', boxSizing: 'border-box', marginBottom: '1rem', outline: 'none' }} />
            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <button onClick={() => setModal(null)} style={{ flex: 1, background: 'transparent', color: C.cinza, border: `1px solid ${C.borda}`, borderRadius: 8, padding: '0.7rem', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.72rem' }}>CANCELAR</button>
              <button onClick={handleCancelar} style={{ flex: 2, background: C.vermelhoPale, color: '#e07070', border: `1px solid ${C.vermelho}40`, borderRadius: 8, padding: '0.7rem', cursor: 'pointer', fontFamily: 'monospace', fontWeight: 700, fontSize: '0.72rem' }}>🚫 CONFIRMAR CANCELAMENTO</button>
            </div>
          </ModalBg>
        )
      }

      {
        modal === 'editar_militar' && militarSel && (
          <ModalBg onClose={() => setModal(null)}>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '1.3rem', letterSpacing: 2, color: C.ouro, marginBottom: '0.8rem', borderBottom: `1px solid ${C.borda}`, paddingBottom: 6 }}>✏️ Editar Militar</div>

            <form onSubmit={handleEditMilitar}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', marginBottom: '0.8rem' }}>
                <div>
                  <label style={{ display: 'block', fontFamily: 'monospace', fontSize: '0.58rem', letterSpacing: 2, color: C.ouro, marginBottom: '0.3rem', textTransform: 'uppercase' }}>Posto*</label>
                  <select value={formEdit.posto} onChange={e => setFormEdit(f => ({ ...f, posto: e.target.value }))}
                    style={controlStyle}>
                    {['', 'Sd', 'Cb', '3º Sgt', '2º Sgt', '1º Sgt', 'ST', 'SUBTEN', '2º Ten', '1º Ten', 'Cap', 'Maj', 'TC', 'Cel'].map(v => <option key={v} value={v}>{v || 'Selecione...'}</option>)}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontFamily: 'monospace', fontSize: '0.58rem', letterSpacing: 2, color: C.ouro, marginBottom: '0.3rem', textTransform: 'uppercase' }}>Regime*</label>
                  <select value={formEdit.regime} onChange={e => setFormEdit(f => ({ ...f, regime: e.target.value }))}
                    style={controlStyle}>
                    {[['12h', '12h (12x60)'], ['24h', '24h (24x72)'], ['exp', 'Expediente']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: '0.8rem' }}>
                <label style={{ display: 'block', fontFamily: 'monospace', fontSize: '0.58rem', letterSpacing: 2, color: C.ouro, marginBottom: '0.3rem', textTransform: 'uppercase' }}>Nome de Guerra*</label>
                <input type="text" value={formEdit.nome} onChange={e => setFormEdit(f => ({ ...f, nome: e.target.value }))}
                  style={controlStyle} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', marginBottom: '0.8rem' }}>
                <div>
                  <label style={{ display: 'block', fontFamily: 'monospace', fontSize: '0.58rem', letterSpacing: 2, color: C.ouro, marginBottom: '0.3rem', textTransform: 'uppercase' }}>RG*</label>
                  <input type="text" value={formEdit.rg} onChange={e => setFormEdit(f => ({ ...f, rg: e.target.value }))}
                    style={controlStyle} />
                </div>

                <div>
                  <label style={{ display: 'block', fontFamily: 'monospace', fontSize: '0.58rem', letterSpacing: 2, color: C.ouro, marginBottom: '0.3rem', textTransform: 'uppercase' }}>Seção/Função</label>
                  <input type="text" value={formEdit.secao} onChange={e => setFormEdit(f => ({ ...f, secao: e.target.value }))}
                    style={controlStyle} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', marginBottom: '0.8rem' }}>
                <div>
                  <label style={{ display: 'block', fontFamily: 'monospace', fontSize: '0.58rem', letterSpacing: 2, color: C.ouro, marginBottom: '0.3rem', textTransform: 'uppercase' }}>Status*</label>
                  <select value={formEdit.ativo ? 'ativo' : 'inativo'} onChange={e => setFormEdit(f => ({ ...f, ativo: e.target.value === 'ativo' }))}
                    style={controlStyle}>
                    <option value="ativo">🟢 Ativo</option>
                    <option value="inativo">🔴 Inativo</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontFamily: 'monospace', fontSize: '0.58rem', letterSpacing: 2, color: C.ouro, marginBottom: '0.3rem', textTransform: 'uppercase' }}>Alterar Senha</label>
                  <input type="password" placeholder="Branco p/ manter" value={formEdit.senha} onChange={e => setFormEdit(f => ({ ...f, senha: e.target.value }))}
                    style={controlStyle} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1.2rem' }}>
                <button type="button" onClick={() => setModal(null)} style={{ flex: 1, background: 'transparent', color: C.cinza, border: `1px solid ${C.borda}`, borderRadius: 8, padding: '0.7rem', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.72rem' }}>CANCELAR</button>
                <button type="submit" style={{ flex: 2, background: C.ouro, color: C.fundo2, border: 'none', borderRadius: 8, padding: '0.7rem', cursor: 'pointer', fontFamily: 'monospace', fontWeight: 700, fontSize: '0.72rem', boxShadow: '0 4px 15px rgba(0,210,255,0.3)' }}>💾 SALVAR ALTERAÇÕES</button>
              </div>
            </form>
          </ModalBg>
        )
      }

      {/* TOAST */}
      {toast && <div style={{ position: 'fixed', bottom: '1.5rem', right: '1.5rem', background: C.vermelho, color: C.creme, fontFamily: 'monospace', fontWeight: 700, fontSize: '0.78rem', padding: '0.8rem 1.2rem', borderRadius: 8, zIndex: 999, boxShadow: '0 8px 30px rgba(0,0,0,.5)', letterSpacing: 1 }}>{toast}</div>}
    </div >
  );
}

function ModalBg({ children, onClose }) {
  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', zIndex: 500, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '1rem', backdropFilter: 'blur(3px)' }}>
      <div style={{ background: C.fundo2, border: `1px solid ${C.borda}`, borderRadius: '16px 16px 12px 12px', padding: '1.5rem', width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }}>{children}</div>
    </div>
  );
}

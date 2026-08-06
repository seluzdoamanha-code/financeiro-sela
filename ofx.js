// Lógica de Conciliação OFX

document.addEventListener('DOMContentLoaded', () => {
    const menuConciliacao = document.getElementById('menuConciliacao');
    const viewConciliacao = document.getElementById('viewConciliacao');
    
    if (menuConciliacao) {
        menuConciliacao.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
            menuConciliacao.classList.add('active');
            
            document.querySelectorAll('.content-body').forEach(el => el.style.display = 'none');
            viewConciliacao.style.display = 'block';
            
            document.getElementById('pageTitle').innerText = 'Conciliação Bancária';
            document.getElementById('pageSubtitle').innerText = 'Importação e conciliação de extratos OFX.';
        });
    }

    const fileOfx = document.getElementById('fileOfx');
    if (fileOfx) {
        fileOfx.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            const text = await file.text();
            processarOFX(text);
            fileOfx.value = ''; // limpa para poder selecionar o mesmo arquivo novamente se precisar
        });
    }
});

let transacoesOfx = [];

async function processarOFX(conteudo) {
    // 1. Extrair informações básicas do OFX
    const tbody = document.getElementById('tabelaOfxBody');
    tbody.innerHTML = '<tr><td colspan="5" style="padding: 24px; text-align: center; color: var(--text-muted);">Processando arquivo...</td></tr>';
    
    console.log("=== INICIO DO ARQUIVO OFX ===");
    console.log(conteudo.substring(0, 1000));
    console.log("=============================");
    
    // Regex para extrair as STMTTRN (suporta OFX SGML sem tags de fechamento)
    const stmttrnRegex = /<STMTTRN>([\s\S]*?)(?=<STMTTRN>|<\/STMTTRN>|<\/BANKTRANLIST>)/gi;
    let match;
    transacoesOfx = [];
    
    while ((match = stmttrnRegex.exec(conteudo)) !== null) {
        const trnData = match[1];
        
        // Regex mais permissivas para extrair os campos
        const dtpostedMatch = /<DTPOSTED>\s*([0-9]{8})/i.exec(trnData);
        const trnamtMatch = /<TRNAMT>\s*([-\d.,]+)/i.exec(trnData);
        const memoMatch = /<MEMO>\s*(.*?)[\r\n<]/i.exec(trnData);
        const fitidMatch = /<FITID>\s*(.*?)[\r\n<]/i.exec(trnData);
        
        if (dtpostedMatch && trnamtMatch) {
            const dateStr = dtpostedMatch[1]; // YYYYMMDD
            const formattedDate = `${dateStr.substring(0,4)}-${dateStr.substring(4,6)}-${dateStr.substring(6,8)}`;
            
            transacoesOfx.push({
                fitid: fitidMatch ? fitidMatch[1].trim() : Math.random().toString(),
                data: formattedDate,
                valor: parseFloat(trnamtMatch[1]),
                descricao: memoMatch ? memoMatch[1].trim() : 'Sem descrição'
            });
        }
    }
    
    // Deduplicar transações idênticas que venham no mesmo arquivo (alguns bancos enviam duplicado)
    const fitidsVistos = new Set();
    transacoesOfx = transacoesOfx.filter(t => {
        if (fitidsVistos.has(t.fitid)) return false;
        fitidsVistos.add(t.fitid);
        return true;
    });
    
    await renderizarTabelaOfx();
}

async function renderizarTabelaOfx() {
    const tbody = document.getElementById('tabelaOfxBody');
    const headerCount = document.getElementById('ofxCountHeader');
    
    if (transacoesOfx.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="padding: 24px; text-align: center; color: var(--text-muted);">Nenhuma transação encontrada no arquivo OFX.</td></tr>';
        if (headerCount) headerCount.style.display = 'none';
        return;
    }
    
    // Fetch unique config (rules + categories) and Pessoas
    let cats = [];
    let regras = [];
    let recArr = [];
    let despArr = [];
    let todasPessoas = [];
    try {
        const [resCfg, resPessoas] = await Promise.all([
            db.from('configuracoes').select('*'),
            db.from('pessoas').select('cpf_cnpj, nome_completo, nome_curto, papeis').order('nome_completo', { ascending: true })
        ]);
        
        if (resPessoas.data) todasPessoas = resPessoas.data;
        
        const data = resCfg.data;
        if (data) {
            let rec = "";
            let desp = "";
            data.forEach(cfg => {
                if (cfg.chave === 'fin_plano_receitas') rec = cfg.valor;
                if (cfg.chave === 'fin_plano_despesas') desp = cfg.valor;
                if (cfg.chave === 'fin_regras_ofx' && cfg.valor) {
                    try { regras = JSON.parse(cfg.valor); } catch(e) {}
                }
            });
            recArr = (rec || "").split('\n').map(s => s.trim()).filter(s => s);
            despArr = (desp || "").split('\n').map(s => s.trim()).filter(s => s);
            cats = [...recArr, ...despArr].sort();
        }
    } catch(e) { console.error("Erro ao carregar configs pro OFX:", e); }
    
    // Deduplicação: Buscar FITIDs já cadastrados no banco
    try {
        const { data: dbTransacoes } = await db.from('fin_transacoes')
            .select('descricao')
            .like('descricao', '%FITID:%');
            
        if (dbTransacoes) {
            const fitidsSalvos = dbTransacoes.map(t => {
                if (!t.descricao) return null;
                const match = t.descricao.match(/FITID:\s*([^\)]+)/i);
                return match ? match[1].trim() : null;
            }).filter(id => id);
            
            transacoesOfx = transacoesOfx.filter(t => !fitidsSalvos.includes(t.fitid));
            
            if (transacoesOfx.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="padding: 24px; text-align: center; color: var(--success); font-weight: 500;">✨ Tudo em dia! Todas as transações deste arquivo já foram importadas e conciliadas.</td></tr>';
                if (headerCount) headerCount.style.display = 'none';
                return;
            }
        }
    } catch(e) { console.error("Erro na deduplicação do OFX:", e); }
    
    if (headerCount) {
        headerCount.innerText = `${transacoesOfx.length} pendentes`;
        headerCount.style.display = 'inline-block';
    }
    
    tbody.innerHTML = '';
    
    // Ordenar por data
    transacoesOfx.sort((a, b) => new Date(a.data) - new Date(b.data));
    
    transacoesOfx.forEach((t, index) => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid var(--border)';
        
        const partes = t.data.split('-');
        const dataStr = `${partes[2]}/${partes[1]}/${partes[0]}`;
        
        const corValor = t.valor >= 0 ? 'var(--success)' : '#ef4444';
        const valorFormatado = Math.abs(t.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const sinal = t.valor >= 0 ? '+' : '-';
        const tipo = t.valor >= 0 ? 'Receita' : 'Despesa';
        
        // Competência default é o mês/ano da data
        const comp = `${partes[1]}/${partes[0]}`;
        
        // --- INÍCIO: Lógica importada do AdminLuz (Extrator de CPF/CNPJ) ---
        const docMatch = t.descricao.match(/\b(\d{11}|\d{14})\b/);
        let cpfExtraido = null;
        let associadoEncontrado = null;
        
        if (docMatch) {
            let doc = docMatch[1];
            if (doc.length === 11) {
                cpfExtraido = `${doc.substring(0,3)}.${doc.substring(3,6)}.${doc.substring(6,9)}-${doc.substring(9)}`;
            } else if (doc.length === 14) {
                cpfExtraido = `${doc.substring(0,2)}.${doc.substring(2,5)}.${doc.substring(5,8)}/${doc.substring(8,12)}-${doc.substring(12)}`;
            }
            associadoEncontrado = todasPessoas.find(p => p.cpf_cnpj === cpfExtraido);
        }
        
        let nomePreenchido = associadoEncontrado ? associadoEncontrado.nome_completo : '';
        // --- FIM: Lógica do CPF ---

        // Auto-categorizar com base nas regras OFX
        let catSelecionada = "";
        for (let r of regras) {
            if (t.descricao.toLowerCase().includes(r.keyword.toLowerCase())) {
                catSelecionada = r.category;
                break;
            }
        }
        
        // Se não achou regra, mas tem CPF e é receita, sugere a categoria de mensalidade (AdminLuz)
        if (!catSelecionada && t.valor >= 0 && associadoEncontrado) {
            const catMensalidade = recArr.find(c => c.toLowerCase().includes('mensalidade'));
            if (catMensalidade) catSelecionada = catMensalidade;
        }
        
        // Construir Options do Select filtrado por tipo
        let optionsHtml = '<option value="">-- Selecione Categoria --</option>';
        cats.forEach(c => {
            const isRec = recArr.includes(c);
            const isDesp = despArr.includes(c);
            
            if (t.valor >= 0 && !isRec) return;
            if (t.valor < 0 && !isDesp) return;
            
            const isSelected = (c === catSelecionada) ? 'selected' : '';
            optionsHtml += `<option value="${c}" ${isSelected}>${c}</option>`;
        });
        let optAssociados = '';
        let optOutros = '';
        
        todasPessoas.forEach(p => {
            const isSelected = (associadoEncontrado && associadoEncontrado.cpf_cnpj === p.cpf_cnpj) ? 'selected' : '';
            const nomePrincipal = p.nome_curto || p.nome_completo;
            const docFormatado = typeof formatarDocumento === 'function' ? formatarDocumento(p.cpf_cnpj) : p.cpf_cnpj;
            const docExtra = docFormatado ? ` (${docFormatado})` : '';
            
            const optHtml = `<option value="${p.cpf_cnpj}" ${isSelected}>${nomePrincipal}${docExtra}</option>`;
            
            if (p.papeis && JSON.stringify(p.papeis).includes('Associado Efetivo')) {
                optAssociados += optHtml;
            } else {
                optOutros += optHtml;
            }
        });
        
        let pessoasOptionsHtml = '<option value="">-- Vincular Pessoa (Opcional) --</option>';
        if (optAssociados) pessoasOptionsHtml += `<optgroup label="Associados Efetivos">${optAssociados}</optgroup>`;
        if (optOutros) pessoasOptionsHtml += `<optgroup label="Outros">${optOutros}</optgroup>`;
        
        tr.innerHTML = `
            <td style="padding: 16px; font-size: 14px;">${dataStr}</td>
            <td style="padding: 16px; font-size: 14px; font-weight: 500;">
                ${t.descricao}
                <div style="font-size: 11px; color: var(--text-muted); font-family: monospace;">FITID: ${t.fitid}</div>
            </td>
            <td style="padding: 16px; font-size: 14px; font-weight: 600; color: ${corValor};">
                ${sinal} R$ ${valorFormatado}
            </td>
            <td style="padding: 16px; font-size: 13px;">
                <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                    <select id="ofx_cat_${index}" style="padding: 6px; border-radius: 4px; border: 1px solid var(--border); background: var(--bg-dark); color: white; flex: 1;">
                        ${optionsHtml}
                    </select>
                    <input type="text" id="ofx_comp_${index}" value="${comp}" style="padding: 6px; border-radius: 4px; border: 1px solid var(--border); background: var(--bg-dark); color: white; width: 70px;" placeholder="MM/AAAA">
                </div>
                <div style="display: flex; gap: 8px;">
                    <select id="ofx_cpf_${index}" style="padding: 6px; border-radius: 4px; border: 1px solid var(--border); background: var(--bg-dark); color: white; flex: 1;">
                        ${pessoasOptionsHtml}
                    </select>
                    <input type="text" id="ofx_nome_${index}" value="${nomePreenchido}" placeholder="Nome Livre" style="padding: 6px; border-radius: 4px; border: 1px solid var(--border); background: var(--bg-dark); color: white; flex: 1;">
                </div>
            </td>
            <td style="padding: 16px; font-size: 14px; text-align: center;">
                <button class="btn btn-primary" onclick="conciliarOfx(${index})" style="background: #10b981; padding: 6px 12px; font-size: 12px;">✅ Salvar Lançamento</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.conciliarOfx = async function(index) {
    const t = transacoesOfx[index];
    const categoria = document.getElementById(`ofx_cat_${index}`).value;
    const competencia = document.getElementById(`ofx_comp_${index}`).value;
    
    const selectPessoa = document.getElementById(`ofx_cpf_${index}`);
    const inNomeLivre = document.getElementById(`ofx_nome_${index}`).value;
    
    let cpfFim = null;
    let nomeFim = inNomeLivre || null;
    
    if (selectPessoa && selectPessoa.value) {
        cpfFim = selectPessoa.value;
        nomeFim = selectPessoa.options[selectPessoa.selectedIndex].text;
    }
    
    if (!competencia) {
        alert("Preencha a competência (MM/AAAA).");
        return;
    }
    
    const tipo = t.valor >= 0 ? 'Receita' : 'Despesa';
    
    const transacao = {
        cpf: cpfFim,
        tipo: tipo,
        data_pagamento: t.data,
        valor: Math.abs(t.valor),
        competencia: competencia,
        descricao: t.descricao + ` (FITID: ${t.fitid})`,
        nome_livre: nomeFim,
        categoria: categoria || null,
        status: 'Pago'
    };
    
    try {
        const { error } = await db.from('fin_transacoes').insert([transacao]);
        if (error) throw error;
        
        // Remove a linha da tabela visualmente ou marca como conciliado
        const tr = document.getElementById(`ofx_cat_${index}`).closest('tr');
        tr.innerHTML = `<td colspan="5" style="padding: 16px; text-align: center; color: var(--success); font-weight: 600;">✅ Conciliado com sucesso no Livro Caixa!</td>`;
        
    } catch (err) {
        console.error(err);
        alert("Erro ao salvar: " + err.message);
    }
};

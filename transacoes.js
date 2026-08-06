// Lógica para o Livro Caixa e Transações Financeiras

document.addEventListener('DOMContentLoaded', () => {
    
    // Configurar Menu Lateral
    const menuDashboard = document.getElementById('menuDashboard');
    const menuLivroCaixa = document.getElementById('menuLivroCaixa');
    
    const viewDashboard = document.getElementById('viewDashboard');
    const viewLivroCaixa = document.getElementById('viewLivroCaixa');
    
    menuDashboard.addEventListener('click', (e) => {
        e.preventDefault();
        limparMenus();
        menuDashboard.classList.add('active');
        document.querySelectorAll('.content-body').forEach(el => el.style.display = 'none');
        viewDashboard.style.display = 'block';
        document.getElementById('pageTitle').innerText = 'Painel Geral';
        document.getElementById('pageSubtitle').innerText = 'Resumo financeiro da casa.';
        carregarDashboard();
    });
    
    menuLivroCaixa.addEventListener('click', (e) => {
        e.preventDefault();
        limparMenus();
        menuLivroCaixa.classList.add('active');
        document.querySelectorAll('.content-body').forEach(el => el.style.display = 'none');
        viewLivroCaixa.style.display = 'block';
        document.getElementById('pageTitle').innerText = 'Livro Caixa';
        document.getElementById('pageSubtitle').innerText = 'Controle de Entradas e Saídas.';
        carregarTransacoes();
    });
    
    function limparMenus() {
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    }
    
    // Escutar quando o login ocorrer com sucesso (disparado pelo auth.js)
    window.addEventListener('financeiro:auth-success', () => {
        carregarDashboard();
    });
    
    // Botão Filtrar no Livro Caixa
    document.getElementById('btnFiltrarCaixa').addEventListener('click', () => {
        carregarTransacoes();
    });
    
    // Modal Novo Lançamento
    document.getElementById('btnNovaTransacao').addEventListener('click', async () => {
        document.getElementById('formNovaTransacao').reset();
        
        // Define a data atual como padrão
        document.getElementById('inDataPagamento').value = new Date().toISOString().split('T')[0];
        
        // Define a competência atual como padrão
        const mes = document.getElementById('filtroMes').value;
        const ano = document.getElementById('filtroAno').value;
        document.getElementById('inCompetencia').value = `${mes}/${ano}`;
        
        document.getElementById('modalTransacao').style.display = 'flex';
        
        // Carregar categorias dinamicamente
        const selCategoria = document.getElementById('inCategoria');
        selCategoria.innerHTML = '<option value="">Carregando...</option>';
        try {
            const { data } = await db.from('configuracoes').select('valor').eq('chave', 'fin_plano_contas').single();
            selCategoria.innerHTML = '<option value="">Selecione...</option>';
            if (data && data.valor) {
                const linhas = data.valor.split('\\n');
                linhas.forEach(cat => {
                    if (cat.trim()) {
                        const opt = document.createElement('option');
                        opt.value = cat.trim();
                        opt.innerText = cat.trim();
                        selCategoria.appendChild(opt);
                    }
                });
            }
        } catch (e) {
            selCategoria.innerHTML = '<option value="">Erro ao carregar categorias</option>';
        }
    });
    
    // Submeter Novo Lançamento
    document.getElementById('formNovaTransacao').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('btnSalvarTransacao');
        const originalText = btn.innerText;
        btn.innerText = 'Salvando...';
        btn.disabled = true;
        
        try {
            const transacao = {
                tipo: document.getElementById('inTipo').value,
                data_pagamento: document.getElementById('inDataPagamento').value,
                valor: parseFloat(document.getElementById('inValor').value),
                competencia: document.getElementById('inCompetencia').value,
                descricao: document.getElementById('inDescricao').value,
                nome_livre: document.getElementById('inNomeLivre').value || null,
                categoria: document.getElementById('inCategoria').value || null,
                status: document.getElementById('inStatus').value
            };
            
            const { error } = await db.from('fin_transacoes').insert([transacao]);
            
            if (error) throw error;
            
            document.getElementById('modalTransacao').style.display = 'none';
            carregarTransacoes(); // Recarrega a tabela e recalcula saldos
            
        } catch (err) {
            console.error(err);
            alert("Erro ao salvar: " + err.message);
        } finally {
            btn.innerText = originalText;
            btn.disabled = false;
        }
    });
});

async function carregarDashboard() {
    // Por enquanto carrega vazio até conectarmos com a base de dados
    document.getElementById('dashSaldoAnterior').innerText = 'R$ 0,00';
    document.getElementById('dashEntradas').innerText = '+ R$ 0,00';
    document.getElementById('dashSaidas').innerText = '- R$ 0,00';
    document.getElementById('dashSaldoAtual').innerText = 'R$ 0,00';
}

async function carregarTransacoes() {
    const tbody = document.getElementById('tabelaCaixaBody');
    tbody.innerHTML = '<tr><td colspan="6" style="padding: 24px; text-align: center; color: var(--text-muted);">Carregando lançamentos...</td></tr>';
    
    const mes = document.getElementById('filtroMes').value;
    const ano = document.getElementById('filtroAno').value;
    const competencia = `${mes}/${ano}`;
    
    try {
        // Obter último dia do mês para a busca
        const ultimoDia = new Date(ano, mes, 0).getDate();
        const dataInicio = `${ano}-${mes}-01`;
        const dataFim = `${ano}-${mes}-${ultimoDia}`;
        
        // Busca na tabela 'fin_transacoes' pela Data de Pagamento (Regime de Caixa)
        const { data, error } = await db.from('fin_transacoes')
            .select('*')
            .gte('data_pagamento', dataInicio)
            .lte('data_pagamento', dataFim)
            .order('data_pagamento', { ascending: false });
            
        if (error) throw error;
        
        tbody.innerHTML = '';
        
        if (!data || data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="padding: 24px; text-align: center; color: var(--text-muted);">Nenhum pagamento registrado em ${competencia}.</td></tr>`;
            return;
        }
        
        data.forEach(t => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid var(--border)';
            
            // Formatando Data (ex: 2026-08-01 -> 01/08/2026)
            let dataStr = t.data_pagamento || '';
            if (dataStr) {
                const partes = dataStr.split('-');
                if (partes.length === 3) dataStr = `${partes[2]}/${partes[1]}/${partes[0]}`;
            }
            
            // Cor do Valor
            const corValor = t.tipo === 'Receita' ? 'var(--success)' : '#ef4444';
            const sinal = t.tipo === 'Receita' ? '+' : '-';
            const valorFormatado = parseFloat(t.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            
            // Badge Status
            const statusCor = t.status === 'Pago' || t.status === 'Recebido' ? 'var(--success)' : 'var(--warning)';
            
            tr.innerHTML = `
                <td style="padding: 16px; font-size: 14px;">${dataStr}</td>
                <td style="padding: 16px; font-size: 14px; font-weight: 500;">
                    ${t.descricao || 'Sem descrição'}<br>
                    <span style="font-size: 12px; color: var(--text-muted); font-weight: normal;">${t.nome_livre || t.cpf || ''}</span>
                </td>
                <td style="padding: 16px; font-size: 14px; color: var(--text-muted);">${t.categoria || '-'}</td>
                <td style="padding: 16px; font-size: 14px;">${t.tipo}</td>
                <td style="padding: 16px;">
                    <span style="padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; color: #fff; background: ${statusCor};">
                        ${t.status}
                    </span>
                </td>
                <td style="padding: 16px; font-size: 14px; font-weight: 600; text-align: right; color: ${corValor};">
                    ${sinal} ${valorFormatado}
                </td>
            `;
            tbody.appendChild(tr);
        });
        
    } catch (err) {
        console.error(err);
        tbody.innerHTML = `<tr><td colspan="6" style="padding: 24px; text-align: center; color: #ef4444;">Erro ao carregar: ${err.message}</td></tr>`;
    }
}

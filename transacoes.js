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
        carregarCaixaEntradaTesouraria();
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
        carregarCaixaEntradaTesouraria();
    });
    
    // Botão Filtrar no Livro Caixa
    document.getElementById('btnFiltrarCaixa').addEventListener('click', () => {
        carregarTransacoes();
    });
    
    // Modal Novo Lançamento
    document.getElementById('btnNovaTransacao').addEventListener('click', async () => {
        document.getElementById('formNovaTransacao').reset();
        document.getElementById('inId').value = '';
        document.getElementById('tituloModalTransacao').innerText = 'Novo Lançamento';
        
        // Define a data atual como padrão
        document.getElementById('inDataPagamento').value = new Date().toISOString().split('T')[0];
        
        // Define a competência atual como padrão
        const mes = document.getElementById('filtroMes').value;
        const ano = document.getElementById('filtroAno').value;
        document.getElementById('inCompetencia').value = `${mes}/${ano}`;
        
        document.getElementById('inPessoaSelect').value = '';
        
        document.getElementById('modalTransacao').style.display = 'flex';
        
        carregarCategoriasDinamicas();
        carregarPessoasModal();
    });
    
    // Atualizar categorias quando trocar Receita/Despesa
    document.getElementById('inTipo').addEventListener('change', () => {
        carregarCategoriasDinamicas();
    });
    
    async function carregarCategoriasDinamicas() {
        const selCategoria = document.getElementById('inCategoria');
        const tipoAtual = document.getElementById('inTipo').value; // 'Receita' ou 'Despesa'
        const chaveBusca = tipoAtual === 'Receita' ? 'fin_plano_receitas' : 'fin_plano_despesas';
        
        selCategoria.innerHTML = '<option value="">Carregando...</option>';
        try {
            const { data } = await db.from('configuracoes').select('valor').eq('chave', chaveBusca).single();
            selCategoria.innerHTML = '<option value="">Selecione...</option>';
            if (data && data.valor) {
                // Separa por quebra de linha real
                const linhas = data.valor.split(/\r?\n/);
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
            selCategoria.innerHTML = '<option value="">(Sem categorias cadastradas)</option>';
        }
    }
    
    // Submeter Novo Lançamento
    document.getElementById('formNovaTransacao').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('btnSalvarTransacao');
        const originalText = btn.innerText;
        btn.innerText = 'Salvando...';
        btn.disabled = true;
        
        try {
            const id = document.getElementById('inId').value;
            
            const selectPessoa = document.getElementById('inPessoaSelect');
            const inNomeLivre = document.getElementById('inNomeLivre').value;
            
            let cpfFim = null;
            let nomeFim = inNomeLivre || null;
            
            if (selectPessoa.value) {
                cpfFim = selectPessoa.value;
                // Pega o texto da option selecionada
                nomeFim = selectPessoa.options[selectPessoa.selectedIndex].text;
            }
            
            const fileInput = document.getElementById('inTransacaoAnexo');
            let anexoUrl = null;
            if (fileInput && fileInput.files.length > 0) {
                const file = fileInput.files[0];
                const fileExt = file.name.split('.').pop();
                const fileName = `transacao_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
                const filePath = `comprovantes/${fileName}`;
                
                btn.innerText = 'Enviando anexo...';
                const { error: uploadError } = await db.storage
                    .from('documentos')
                    .upload(filePath, file);
                    
                if (uploadError) throw uploadError;
                
                const { data: publicUrlData } = db.storage.from('documentos').getPublicUrl(filePath);
                anexoUrl = publicUrlData.publicUrl;
                btn.innerText = 'Salvando Lançamento...';
            }
            
            const transacao = {
                cpf: cpfFim,
                tipo: document.getElementById('inTipo').value,
                data_pagamento: document.getElementById('inDataPagamento').value,
                valor: parseFloat(document.getElementById('inValor').value),
                competencia: document.getElementById('inCompetencia').value,
                descricao: document.getElementById('inDescricao').value,
                nome_livre: nomeFim,
                categoria: document.getElementById('inCategoria').value || null,
                status: document.getElementById('inStatus').value
            };
            
            if (anexoUrl) {
                transacao.anexo_url = anexoUrl;
            }
            
            let query;
            if (id) {
                // Editar
                query = db.from('fin_transacoes').update(transacao).eq('id', id);
            } else {
                // Novo
                query = db.from('fin_transacoes').insert([transacao]);
            }
            
            const { error } = await query;
            
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
    const dataAtual = new Date();
    // Ajusta o mês e ano corrente
    const mm = (dataAtual.getMonth() + 1).toString().padStart(2, '0');
    const aaaa = dataAtual.getFullYear().toString();
    const competencia = `${mm}/${aaaa}`;
    
    // Formata algo como "Agosto 2026"
    const nomeMes = dataAtual.toLocaleString('pt-BR', { month: 'long' });
    const rotuloData = nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1) + ' ' + aaaa;
    document.getElementById('currentMonthLabel').innerText = rotuloData;

    try {
        let saldoAnt = 0;
        const { data: cfg } = await db.from('configuracoes').select('valor').eq('chave', `saldo_ant_${competencia}`).single();
        if (cfg && cfg.valor) saldoAnt = parseFloat(cfg.valor);

        const { data: transacoes } = await db.from('fin_transacoes')
            .select('valor, tipo')
            .eq('competencia', competencia)
            .eq('status', 'Pago');
            
        let entradas = 0;
        let saidas = 0;
        
        if (transacoes) {
            transacoes.forEach(t => {
                const v = parseFloat(t.valor) || 0;
                if ((t.tipo || 'Despesa') === 'Receita') {
                    entradas += v;
                } else {
                    saidas += v;
                }
            });
        }
        
        const saldoAtual = saldoAnt + entradas - saidas;
        
        document.getElementById('dashSaldoAnterior').innerText = `R$ ${saldoAnt.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        document.getElementById('dashEntradas').innerText = `+ R$ ${entradas.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        document.getElementById('dashSaidas').innerText = `- R$ ${saidas.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        document.getElementById('dashSaldoAtual').innerText = `R$ ${saldoAtual.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        
    } catch(e) {
        console.error("Erro no dashboard:", e);
    }
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
                <td style="padding: 16px; font-size: 14px; text-align: center;">
                    ${t.anexo_url ? `<a href="${t.anexo_url}" target="_blank" class="btn" style="padding: 6px; background: transparent; color: var(--primary); font-size: 16px; text-decoration: none;" title="Ver Anexo">📎</a>` : ''}
                    <button class="btn" style="padding: 6px; background: transparent; color: var(--text-main); font-size: 16px;" onclick="editarTransacao('${t.id}')" title="Editar">✏️</button>
                    <button class="btn" style="padding: 6px; background: transparent; color: #ef4444; font-size: 16px;" onclick="excluirTransacao('${t.id}')" title="Excluir">🗑️</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
        
    } catch (err) {
        console.error(err);
        tbody.innerHTML = `<tr><td colspan="6" style="padding: 24px; text-align: center; color: #ef4444;">Erro ao carregar: ${err.message}</td></tr>`;
    }
}

// Global functions for inline button calls
window.editarTransacao = async function(id) {
    try {
        const { data, error } = await db.from('fin_transacoes').select('*').eq('id', id).single();
        if (error) throw error;
        
        document.getElementById('inId').value = data.id;
        document.getElementById('inTipo').value = data.tipo;
        document.getElementById('inDataPagamento').value = data.data_pagamento;
        document.getElementById('inValor').value = data.valor;
        document.getElementById('inCompetencia').value = data.competencia;
        document.getElementById('inDescricao').value = data.descricao;
        document.getElementById('inStatus').value = data.status;
        
        document.getElementById('inPessoaSelect').value = data.cpf || '';
        if (data.cpf) {
            document.getElementById('inNomeLivre').value = '';
        } else {
            document.getElementById('inNomeLivre').value = data.nome_livre || '';
        }
        
        document.getElementById('tituloModalTransacao').innerText = 'Editar Lançamento';
        
        // Puxar as categorias corretas e depois setar o valor
        const tipoAtual = data.tipo;
        const chaveBusca = tipoAtual === 'Receita' ? 'fin_plano_receitas' : 'fin_plano_despesas';
        const selCategoria = document.getElementById('inCategoria');
        
        const { data: cfg } = await db.from('configuracoes').select('valor').eq('chave', chaveBusca).single();
        selCategoria.innerHTML = '<option value="">Selecione...</option>';
        if (cfg && cfg.valor) {
            cfg.valor.split(/\r?\n/).forEach(cat => {
                if (cat.trim()) {
                    const opt = document.createElement('option');
                    opt.value = cat.trim();
                    opt.innerText = cat.trim();
                    selCategoria.appendChild(opt);
                }
            });
        }
        
        selCategoria.value = data.categoria || '';
        
        // Garante que as pessoas sejam carregadas também ao editar
        await carregarPessoasModal();
        document.getElementById('inPessoaSelect').value = data.cpf || '';
        
        document.getElementById('modalTransacao').style.display = 'flex';
        
    } catch (err) {
        alert("Erro ao buscar transação: " + err.message);
    }
};

window.excluirTransacao = async function(id) {
    if (!confirm("Tem certeza que deseja excluir este lançamento? Esta ação não pode ser desfeita.")) return;
    
    try {
        const { error } = await db.from('fin_transacoes').delete().eq('id', id);
        if (error) throw error;
        carregarTransacoes();
    } catch (err) {
        alert("Erro ao excluir: " + err.message);
    }
};

// Variável global para cache de pessoas
let cachePessoas = null;

async function carregarPessoasModal() {
    const selPessoa = document.getElementById('inPessoaSelect');
    
    // Se já temos cache, não precisa buscar de novo (só reseta a seleção que é feita no click)
    if (cachePessoas) {
        popularSelectPessoas(selPessoa, cachePessoas);
        return;
    }
    
    selPessoa.innerHTML = '<option value="">Carregando...</option>';
    try {
        const { data, error } = await db.from('pessoas').select('*').order('nome_completo', { ascending: true });
        if (error) throw error;
        
        cachePessoas = data;
        popularSelectPessoas(selPessoa, cachePessoas);
    } catch (err) {
        console.error("Erro ao puxar pessoas do Supabase:", err);
        selPessoa.innerHTML = '<option value="">Erro ao buscar pessoas</option>';
    }
}

function popularSelectPessoas(selectEl, listaPessoas) {
    const valorAtual = selectEl.value; // Preserva o que estava lá (útil no editar)
    
    selectEl.innerHTML = '<option value="">-- Selecionar Pessoa (Opcional) --</option>';
    
    const optAssociados = document.createElement('optgroup');
    optAssociados.label = 'Associados Efetivos';
    
    const optOutros = document.createElement('optgroup');
    optOutros.label = 'Outros';
    
    listaPessoas.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.cpf_cnpj;
        
        const nomePrincipal = p.nome_curto || p.nome_completo;
        const docFormatado = formatarDocumento(p.cpf_cnpj);
        const docExtra = docFormatado ? ` (${docFormatado})` : '';
        opt.innerText = `${nomePrincipal}${docExtra}`;
        
        if (p.papeis && JSON.stringify(p.papeis).includes('Associado Efetivo')) {
            optAssociados.appendChild(opt);
        } else {
            optOutros.appendChild(opt);
        }
    });
    
    selectEl.appendChild(optAssociados);
    selectEl.appendChild(optOutros);
    
    if (valorAtual) selectEl.value = valorAtual;
}

function formatarDocumento(doc) {
    if (!doc) return '';
    const num = doc.replace(/\D/g, '');
    if (num.length === 11) {
        return num.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
    } else if (num.length === 14) {
        return num.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
    }
}

// ==========================================
// CAIXA DE ENTRADA (TESOURARIA)
// ==========================================
window.carregarCaixaEntradaTesouraria = async function() {
    const lista = document.getElementById('listaTesouraria');
    if (!lista) return;
    
    lista.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 24px;">Atualizando...</div>';
    
    try {
        const { data, error } = await db.from('app_tesouraria_envios')
                                        .select('*')
                                        .eq('status', 'pendente')
                                        .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        if (!data || data.length === 0) {
            lista.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 24px;">Nenhum documento pendente. 🎉</div>';
            return;
        }
        
        lista.innerHTML = '';
        data.forEach(item => {
            const dataEnvio = new Date(item.created_at).toLocaleString('pt-BR');
            const div = document.createElement('div');
            div.style.cssText = 'padding: 16px; border: 1px solid var(--border); border-radius: 8px; background: rgba(0,0,0,0.1); display: flex; justify-content: space-between; align-items: flex-start; gap: 16px;';
            
            let htmlArquivo = '';
            if (item.arquivo_url) {
                htmlArquivo = `<a href="${item.arquivo_url}" target="_blank" style="display: inline-block; margin-top: 8px; font-size: 13px; color: var(--primary); text-decoration: none;">📎 Visualizar Anexo</a>`;
            }
            
            div.innerHTML = `
                <div style="flex: 1;">
                    <div style="font-weight: 500; font-size: 15px;">${item.descricao || 'Sem descrição'}</div>
                    <div style="font-size: 13px; color: var(--text-muted); margin-top: 4px;">Enviado por: ${item.remetente_nome || 'Desconhecido'} em ${dataEnvio}</div>
                    ${htmlArquivo}
                </div>
                <div>
                    <button onclick="processarEnvioTesouraria('${item.id}')" style="background: var(--success); color: white; border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500;">✓ Arquivar</button>
                </div>
            `;
            lista.appendChild(div);
        });
        
    } catch (err) {
        lista.innerHTML = `<div style="text-align: center; color: #ef4444; padding: 24px;">Erro ao carregar: ${err.message}</div>`;
    }
};

window.processarEnvioTesouraria = async function(id) {
    abrirModalConfirmacao(
        "Arquivar Documento", 
        "Deseja marcar este documento como Processado/Arquivado? Ele sairá da sua Caixa de Entrada principal.",
        async () => {
            try {
                // Adicionando .select() para garantir que o Supabase retorne os dados
                const { data, error } = await db.from('app_tesouraria_envios')
                                        .update({ status: 'processado' })
                                        .eq('id', id)
                                        .select();
                
                if (error) throw error;
                if (!data || data.length === 0) {
                    throw new Error("O documento não foi atualizado! Pode ser falta de permissão de UPDATE (RLS Policy). Peça ao dev para ajustar a tabela app_tesouraria_envios.");
                }
                
                carregarCaixaEntradaTesouraria();
                
                // Atualiza a tela de documentos também se estiver carregada
                if (typeof carregarDocumentos === 'function') {
                    carregarDocumentos();
                }
            } catch (err) {
                alert("Erro ao processar: " + err.message);
            }
        }
    );
};

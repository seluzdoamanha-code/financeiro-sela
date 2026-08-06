document.addEventListener('DOMContentLoaded', () => {
    const menuRelatorios = document.getElementById('menuRelatorios');
    const viewRelatorios = document.getElementById('viewRelatorios');
    
    if (menuRelatorios) {
        menuRelatorios.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
            menuRelatorios.classList.add('active');
            
            document.querySelectorAll('.content-body').forEach(el => el.style.display = 'none');
            viewRelatorios.style.display = 'block';
            
            document.getElementById('pageTitle').innerText = 'Relatórios Contábeis';
            document.getElementById('pageSubtitle').innerText = 'Emissão de Livro Caixa e DFC.';
            
            atualizarLabelsFiltro();
            carregarRelatorio();
        });
    }

    // Bind radios
    document.querySelectorAll('input[name="modoRelatorio"]').forEach(radio => {
        radio.addEventListener('change', () => {
            atualizarLabelsFiltro();
            carregarRelatorio();
        });
    });

    const relMes = document.getElementById('relMes');
    const relAno = document.getElementById('relAno');
    if (relMes) relMes.addEventListener('change', carregarRelatorio);
    if (relAno) relAno.addEventListener('change', carregarRelatorio);
    
    const btnSalvarSaldo = document.getElementById('btnSalvarSaldo');
    if (btnSalvarSaldo) {
        btnSalvarSaldo.addEventListener('click', salvarSaldoAnterior);
    }
    
    const btnImprimirRelatorio = document.getElementById('btnImprimirRelatorio');
    if (btnImprimirRelatorio) {
        btnImprimirRelatorio.addEventListener('click', imprimirRelatorio);
    }
});

function atualizarLabelsFiltro() {
    const modo = document.querySelector('input[name="modoRelatorio"]:checked').value;
    const lblData = document.getElementById('lblFiltroData');
    const relMes = document.getElementById('relMes');
    const containerSaldo = document.getElementById('containerSaldoAnterior');
    const btnImprimir = document.getElementById('btnImprimirRelatorio');

    if (modo === 'mensal') {
        lblData.innerText = 'Mês de Referência:';
        relMes.style.display = 'inline-block';
        containerSaldo.style.display = 'flex';
        btnImprimir.innerHTML = '🖨️ Emitir DFC Mensal';
        btnImprimir.style.background = '#a855f7';
    } else if (modo === 'anual') {
        lblData.innerText = 'Ano de Referência:';
        relMes.style.display = 'none';
        containerSaldo.style.display = 'none';
        btnImprimir.innerHTML = '🖨️ Emitir DFC Anual';
        btnImprimir.style.background = '#f97316';
    } else {
        lblData.innerText = 'Mês de Referência:';
        relMes.style.display = 'inline-block';
        containerSaldo.style.display = 'none';
        btnImprimir.innerHTML = '🖨️ Imprimir Livro Caixa';
        btnImprimir.style.background = '#3b82f6';
    }
}

function getRelatorioDataRef() {
    const modo = document.querySelector('input[name="modoRelatorio"]:checked').value;
    const m = document.getElementById('relMes').value;
    const a = document.getElementById('relAno').value;
    return modo === 'anual' ? a : `${m}/${a}`;
}

async function carregarRelatorio() {
    const modo = document.querySelector('input[name="modoRelatorio"]:checked').value;
    const dataRef = getRelatorioDataRef();
    
    const tbody = document.getElementById('tabelaRelatorioBody');
    const thead = document.getElementById('tabelaRelatorioHead');
    
    tbody.innerHTML = '<tr><td colspan="5" style="padding: 24px; text-align: center; color: black;">Carregando dados...</td></tr>';

    try {
        let query = db.from('fin_transacoes').select('*');
        
        if (modo === 'anual') {
            query = query.gte('data_pagamento', `${dataRef}-01-01`).lte('data_pagamento', `${dataRef}-12-31`);
        } else {
            const [m, a] = dataRef.split('/');
            // Pega o último dia daquele mês
            const ultimoDia = new Date(a, parseInt(m), 0).getDate();
            query = query.gte('data_pagamento', `${a}-${m}-01`).lte('data_pagamento', `${a}-${m}-${ultimoDia}`);
        }
        
        // Apenas transações Pagas
        query = query.eq('status', 'Pago').order('data_pagamento', { ascending: true });

        const { data: transacoes, error } = await query;
        if (error) throw error;

        let saldoAnterior = 0;
        if (modo === 'mensal') {
            const { data: cfg } = await db.from('configuracoes').select('valor').eq('chave', `saldo_ant_${dataRef}`).single();
            if (cfg && cfg.valor) saldoAnterior = parseFloat(cfg.valor);
            document.getElementById('relSaldoAnterior').value = saldoAnterior.toFixed(2);
        }

        if (modo === 'auditoria') {
            renderExtratoLançamentos(thead, tbody, transacoes || []);
        } else {
            renderDFC(thead, tbody, transacoes || [], saldoAnterior);
        }
    } catch (e) {
        console.error(e);
        tbody.innerHTML = `<tr><td colspan="5" style="padding: 24px; text-align: center; color: red;">Erro: ${e.message}</td></tr>`;
    }
}

function renderExtratoLançamentos(thead, tbody, transacoes) {
    thead.innerHTML = `
        <tr>
            <th style="padding: 12px; text-align: center; border: 1px solid #cbd5e1; width: 100px;">Data</th>
            <th style="padding: 12px; text-align: left; border: 1px solid #cbd5e1;">Origem / Referência</th>
            <th style="padding: 12px; text-align: center; border: 1px solid #cbd5e1; width: 100px;">Tipo</th>
            <th style="padding: 12px; text-align: left; border: 1px solid #cbd5e1; width: 150px;">Categoria</th>
            <th style="padding: 12px; text-align: left; border: 1px solid #cbd5e1;">Descrição</th>
            <th style="padding: 12px; text-align: right; border: 1px solid #cbd5e1; width: 120px;">Valor (R$)</th>
        </tr>
    `;

    tbody.innerHTML = '';
    
    transacoes.forEach((t) => {
        const dataP = t.data_pagamento ? t.data_pagamento.split('-').reverse().join('/') : '-';
        const origem = t.nome_livre || '-';
        const tipoStr = t.tipo || 'Despesa';
        let valColor = tipoStr === 'Receita' ? '#16a34a' : '#ef4444';
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="padding: 8px; text-align: center; border: 1px solid #cbd5e1;">${dataP}</td>
            <td style="padding: 8px; border: 1px solid #cbd5e1;">${origem}</td>
            <td style="padding: 8px; text-align: center; border: 1px solid #cbd5e1;">${tipoStr}</td>
            <td style="padding: 8px; border: 1px solid #cbd5e1;">${t.categoria || '-'}</td>
            <td style="padding: 8px; border: 1px solid #cbd5e1;">${t.descricao || '-'}</td>
            <td style="padding: 8px; text-align: right; border: 1px solid #cbd5e1; color: ${valColor};">R$ ${parseFloat(t.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderDFC(thead, tbody, transacoes, saldoAnterior) {
    thead.innerHTML = `
        <tr>
            <th style="padding: 12px; text-align: left; border: 1px solid #cbd5e1;">Contas / Categoria</th>
            <th style="padding: 12px; text-align: right; border: 1px solid #cbd5e1; width: 150px;">Entradas (R$)</th>
            <th style="padding: 12px; text-align: right; border: 1px solid #cbd5e1; width: 150px;">Saídas (R$)</th>
        </tr>
    `;
    
    const agrupado = {};
    let totalEntradas = 0;
    let totalSaidas = 0;

    transacoes.forEach(t => {
        const cat = t.categoria || 'Sem Categoria';
        const tipo = t.tipo || 'Despesa';
        const v = parseFloat(t.valor) || 0;
        if (!agrupado[cat]) agrupado[cat] = { receitas: 0, despesas: 0 };
        
        if (tipo === 'Receita') {
            agrupado[cat].receitas += v;
            totalEntradas += v;
        } else {
            agrupado[cat].despesas += v;
            totalSaidas += v;
        }
    });

    const catsReceitas = Object.keys(agrupado).filter(k => agrupado[k].receitas > 0).sort();
    const catsDespesas = Object.keys(agrupado).filter(k => agrupado[k].despesas > 0).sort();

    tbody.innerHTML = '';

    tbody.innerHTML += `
        <tr style="background: #f8fafc; font-weight: 600;">
            <td style="padding: 8px; border: 1px solid #cbd5e1;">SALDO ANTERIOR</td>
            <td style="padding: 8px; text-align: right; border: 1px solid #cbd5e1;">R$ ${saldoAnterior.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td style="padding: 8px; border: 1px solid #cbd5e1;"></td>
        </tr>
        <tr style="background: #f1f5f9; font-weight: 600;">
            <td style="padding: 8px; border: 1px solid #cbd5e1;">RECEBIMENTOS (ENTRADAS)</td>
            <td style="padding: 8px; border: 1px solid #cbd5e1;"></td>
            <td style="padding: 8px; border: 1px solid #cbd5e1;"></td>
        </tr>
    `;

    catsReceitas.forEach(cat => {
        tbody.innerHTML += `
            <tr>
                <td style="padding: 8px; border: 1px solid #cbd5e1; padding-left: 24px;">${cat}</td>
                <td style="padding: 8px; text-align: right; border: 1px solid #cbd5e1; font-weight: 600;">R$ ${agrupado[cat].receitas.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td style="padding: 8px; border: 1px solid #cbd5e1;"></td>
            </tr>
        `;
    });

    tbody.innerHTML += `
        <tr style="background: #f1f5f9; font-weight: 600;">
            <td style="padding: 8px; border: 1px solid #cbd5e1;">PAGAMENTOS (SAÍDAS)</td>
            <td style="padding: 8px; border: 1px solid #cbd5e1;"></td>
            <td style="padding: 8px; border: 1px solid #cbd5e1;"></td>
        </tr>
    `;

    catsDespesas.forEach(cat => {
        tbody.innerHTML += `
            <tr>
                <td style="padding: 8px; border: 1px solid #cbd5e1; padding-left: 24px;">${cat}</td>
                <td style="padding: 8px; border: 1px solid #cbd5e1;"></td>
                <td style="padding: 8px; text-align: right; border: 1px solid #cbd5e1; font-weight: 600;">R$ ${agrupado[cat].despesas.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            </tr>
        `;
    });

    const saldoAtual = saldoAnterior + totalEntradas - totalSaidas;

    tbody.innerHTML += `
        <tr style="background: #f8fafc; font-weight: 600;">
            <td style="padding: 8px; border: 1px solid #cbd5e1;">SALDOS DO PERÍODO</td>
            <td style="padding: 8px; text-align: right; border: 1px solid #cbd5e1;">R$ ${totalEntradas.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td style="padding: 8px; text-align: right; border: 1px solid #cbd5e1;">R$ ${totalSaidas.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        </tr>
        <tr style="background: ${saldoAtual >= 0 ? '#dcfce7' : '#fee2e2'}; font-weight: bold; font-size: 16px;">
            <td style="padding: 12px; text-align: right; border: 1px solid #cbd5e1;">Saldo Final DFC:</td>
            <td style="padding: 12px; text-align: right; border: 1px solid #cbd5e1;" colspan="2">R$ ${saldoAtual.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        </tr>
    `;
}

async function salvarSaldoAnterior() {
    const dataRef = getRelatorioDataRef();
    const val = parseFloat(document.getElementById('relSaldoAnterior').value) || 0;
    
    if (!/^\d{2}\/\d{4}$/.test(dataRef)) return;
    
    const chave = `saldo_ant_${dataRef}`;
    const payload = { chave: chave, valor: val.toString() };
    
    const btn = document.getElementById('btnSalvarSaldo');
    btn.innerText = '...';
    try {
        await db.from('configuracoes').upsert(payload, { onConflict: 'chave' });
        btn.innerText = 'Salvo!';
        setTimeout(() => btn.innerText = 'Salvar Saldo', 2000);
        carregarRelatorio();
    } catch (e) {
        alert("Erro ao salvar: " + e.message);
        btn.innerText = 'Salvar Saldo';
    }
}

function imprimirRelatorio() {
    const modo = document.querySelector('input[name="modoRelatorio"]:checked').value;
    const dataRef = getRelatorioDataRef();
    
    let titulo = "LIVRO CAIXA - EXTRATO DE LANÇAMENTOS";
    let sub = `MÊS DE REFERÊNCIA (AUDITORIA): ${dataRef}`;
    
    if (modo === 'mensal') {
        titulo = "DEMONSTRATIVO DE FLUXO DE CAIXA (DFC)";
        sub = `MÊS DE REFERÊNCIA: ${dataRef}`;
    } else if (modo === 'anual') {
        titulo = "DEMONSTRATIVO DE FLUXO DE CAIXA (DFC)";
        sub = `ANO DE REFERÊNCIA: ${dataRef}`;
    }

    const htmlTabela = document.getElementById('tabelaRelatorioCore').outerHTML;
    
    const urlLogo = window.location.origin + window.location.pathname.replace('index.html', '') + 'logo_sela.png';
    
    const printWin = window.open('', '_blank');
    printWin.document.write(`
        <html>
            <head>
                <title>Relatório - SELA</title>
                <style>
                    body { font-family: Arial, sans-serif; color: black; margin: 40px; }
                    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #ccc; padding-bottom: 20px; margin-bottom: 30px; }
                    .header-logo { display: flex; align-items: center; gap: 16px; }
                    .header-logo img { height: 60px; }
                    .header-logo div { font-weight: bold; font-size: 16px; line-height: 1.2; }
                    .header-title { text-align: right; }
                    .header-title h1 { margin: 0; font-size: 20px; text-transform: uppercase; }
                    .header-title h2 { margin: 8px 0 0 0; font-size: 14px; font-weight: normal; }
                    
                    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 60px; }
                    th, td { border: 1px solid #333 !important; padding: 8px !important; color: black !important; }
                    th { background-color: #f0f0f0 !important; }
                    
                    .signatures { display: flex; justify-content: space-between; margin-top: 100px; page-break-inside: avoid; }
                    .sign-box { width: 300px; }
                    .sign-line { border-bottom: 1px solid black; margin-bottom: 8px; }
                    .sign-label { text-align: right; font-size: 14px; }
                </style>
            </head>
            <body>
                <div class="header">
                    <div class="header-logo">
                        <img src="${urlLogo}" alt="SELA Logo">
                        <div>
                            Sociedade Espírita<br>
                            Luz do Amanhã
                        </div>
                    </div>
                    <div class="header-title">
                        <h1>${titulo}</h1>
                        <h2>${sub}</h2>
                    </div>
                </div>
                
                ${htmlTabela}
                
                <div class="signatures">
                    <div class="sign-box">
                        <div class="sign-line"></div>
                        <div style="font-size: 14px; margin-bottom: 16px;">Visto:</div>
                        <div style="font-size: 14px;">Data: ____/____/________</div>
                    </div>
                    <div class="sign-box">
                        <div class="sign-line"></div>
                        <div class="sign-label">${modo === 'auditoria' ? 'Tesouraria' : 'Tesouraria'}</div>
                    </div>
                </div>
                
                ${modo !== 'auditoria' ? `
                <div class="signatures" style="margin-top: 60px;">
                    <div class="sign-box">
                        <div class="sign-line"></div>
                        <div style="font-size: 14px; margin-bottom: 16px;">Visto:</div>
                        <div style="font-size: 14px;">Data: ____/____/________</div>
                    </div>
                    <div class="sign-box">
                        <div class="sign-line"></div>
                        <div class="sign-label">Diretoria</div>
                    </div>
                </div>
                ` : ''}
            </body>
        </html>
    `);
    
    printWin.document.close();
    setTimeout(() => {
        printWin.print();
    }, 500);
}

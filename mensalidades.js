document.addEventListener('DOMContentLoaded', () => {

    const menuMensalidades = document.getElementById('menuMensalidades');
    const viewMensalidades = document.getElementById('viewMensalidades');

    // Conectar ao botão lateral (certifique-se de que a class nav-item etc foi adicionada no index.html)
    if (menuMensalidades) {
        menuMensalidades.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
            menuMensalidades.classList.add('active');

            document.querySelectorAll('.content-body').forEach(el => el.style.display = 'none');
            viewMensalidades.style.display = 'block';

            document.getElementById('pageTitle').innerText = 'Gestão de Mensalidades';
            document.getElementById('pageSubtitle').innerText = 'Controle financeiro de Associados Efetivos.';

            carregarListaAssociados();
        });
    }

});

async function carregarListaAssociados() {
    const lista = document.getElementById('listaAssociados');
    lista.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 13px;">Carregando associados...</div>';

    try {
        // Busca as Pessoas lá da tabela central do Portal (assumindo que a tabela se chama 'pessoas')
        // Vamos buscar todos e depois filtrar localmente, ou buscar apenas quem tem status/cargo específico
        const { data: pessoas, error } = await db.from('pessoas')
            .select('id, cpf_cnpj, nome_completo, email, papeis, celular')
            .contains('papeis', ['Associado Efetivo'])
            .order('nome_completo', { ascending: true });

        if (error) throw error;

        lista.innerHTML = '';

        if (!pessoas || pessoas.length === 0) {
            lista.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 13px;">Nenhuma pessoa encontrada.</div>';
            return;
        }

        pessoas.forEach(p => {
            const docFormatado = typeof formatarDocumento === 'function' ? formatarDocumento(p.cpf_cnpj) : p.cpf_cnpj;
            const docExibicao = docFormatado || p.email || 'Sem CPF/CNPJ';

            const div = document.createElement('div');
            div.className = 'assoc-item';
            div.setAttribute('data-cpf', p.cpf_cnpj || '');
            div.innerHTML = `
                <div style="flex: 1;">
                    <div style="font-weight: 500;" class="nome-associado">${p.nome_completo}</div>
                    <div style="font-size: 11px; color: var(--text-muted);">${docExibicao}</div>
                </div>
            `;

            div.addEventListener('click', () => selecionarAssociado(p, div));

            lista.appendChild(div);
        });

        // Inicia verificação assíncrona de atrasos para colocar o alerta
        sinalizarAtrasos(pessoas);

    } catch (err) {
        console.error("Erro ao buscar pessoas:", err);
        lista.innerHTML = `<div style="padding: 24px; text-align: center; color: #ef4444; font-size: 13px;">Erro: ${err.message}</div>`;
    }
}

let associadoAtivo = null;

async function selecionarAssociado(pessoa, elementClicked) {
    // Atualizar UI da lista
    document.querySelectorAll('.assoc-item').forEach(el => el.classList.remove('active'));
    if (elementClicked) elementClicked.classList.add('active');

    associadoAtivo = pessoa;

    // Destrancar o painel da direita
    const painel = document.getElementById('painelDetalheMensalidade');
    painel.style.opacity = '1';
    painel.style.pointerEvents = 'auto';

    document.getElementById('nomeAssociadoSelecionado').innerText = pessoa.nome_completo;

    // Limpar tabela
    document.getElementById('tabelaMensalidadesAssociado').innerHTML = '<tr><td colspan="5" style="padding: 24px; text-align: center; color: var(--text-muted);">Buscando histórico...</td></tr>';

    // Buscar configuração na tabela 'fin_config_mensalidades'
    try {
        const { data: cfg } = await db.from('fin_config_mensalidades').select('*').eq('cpf_cnpj', pessoa.cpf_cnpj).single();
        if (cfg) {
            document.getElementById('cfgValorMensalidade').value = cfg.valor || '';
            document.getElementById('cfgDiaVencimento').value = cfg.dia_vencimento || '';
            document.getElementById('cfgInicio').value = cfg.inicio_mm_aaaa || '';
        } else {
            document.getElementById('cfgValorMensalidade').value = '';
            document.getElementById('cfgDiaVencimento').value = '';
            document.getElementById('cfgInicio').value = '';
        }
    } catch (err) {
        console.log("Sem config prévia para este usuário.");
    }

    gerarTabelaMensalidadesReal(pessoa);
}

document.getElementById('btnSalvarConfigMensalidade').addEventListener('click', async () => {
    if (!associadoAtivo) return;

    const btn = document.getElementById('btnSalvarConfigMensalidade');
    btn.innerText = 'Salvando...';
    btn.disabled = true;

    const payload = {
        cpf_cnpj: associadoAtivo.cpf_cnpj,
        valor: document.getElementById('cfgValorMensalidade').value,
        dia_vencimento: document.getElementById('cfgDiaVencimento').value,
        inicio_mm_aaaa: document.getElementById('cfgInicio').value
    };

    try {
        const { error } = await db.from('fin_config_mensalidades').upsert(payload, { onConflict: 'cpf_cnpj' });
        if (error) throw error;

        btn.innerText = 'Salvo!';
        btn.style.background = '#10b981';
        btn.style.color = 'white';

        setTimeout(() => {
            btn.innerText = 'Salvar Configuração';
            btn.style.background = '';
            btn.style.color = '';
            btn.disabled = false;
        }, 2000);

        // Recarrega a tabela para atualizar cores de Atrasado baseadas no novo Vencimento
        gerarTabelaMensalidadesReal(associadoAtivo);
        sinalizarAtrasos([associadoAtivo]);
    } catch (err) {
        console.error(err);
        alert('Erro ao salvar configuração: ' + err.message);
        btn.innerText = 'Salvar Configuração';
        btn.disabled = false;
    }
});

async function sinalizarAtrasos(pessoas) {
    if (!pessoas || pessoas.length === 0) return;

    const ano = document.getElementById('filtroAnoMensalidade').value || new Date().getFullYear().toString();
    const cpfs = pessoas.map(p => p.cpf_cnpj).filter(Boolean);

    try {
        // Busca configurações de mensalidade de todos
        const { data: configs } = await db.from('fin_config_mensalidades').select('*').in('cpf_cnpj', cpfs);
        // Busca pagamentos de mensalidade do ano de todos
        const { data: transacoes } = await db.from('fin_transacoes')
            .select('*')
            .eq('categoria', 'Mensalidade')
            .like('competencia', `%/${ano}`);

        const configsSeguros = configs || [];
        const transacoesSeguras = transacoes || [];

        const dataAtual = new Date();
        const mesAtual = dataAtual.getMonth(); // 0-11

        pessoas.forEach(p => {
            if (!p.cpf_cnpj) return;

            const cfg = configsSeguros.find(c => c.cpf_cnpj === p.cpf_cnpj);
            if (!cfg) return; // Sem config, assumimos que não tem atraso (pois não tem mensalidade gerada)

            const cfgDia = parseInt(cfg.dia_vencimento) || 10;
            const pagamentos = transacoesSeguras.filter(t => t.cpf === p.cpf_cnpj);

            let emAtraso = false;

            // Verifica os meses de janeiro até o mês atual
            for (let i = 0; i <= mesAtual; i++) {
                const numMes = (i + 1).toString().padStart(2, '0');
                const comp = `${numMes}/${ano}`;

                const pgto = pagamentos.find(t => t.competencia === comp);
                const dataVencimento = new Date(ano, i, cfgDia);

                // Zera as horas para comparar apenas os dias corretamente
                dataVencimento.setHours(23, 59, 59, 999);

                if (!pgto && dataAtual > dataVencimento) {
                    emAtraso = true;
                    break;
                }
            }

            if (emAtraso) {
                const div = document.querySelector(`.assoc-item[data-cpf="${p.cpf_cnpj}"] .nome-associado`);
                if (div) {
                    div.innerHTML = `<span style="color: #ef4444;" title="Mensalidade em Atraso">❗️</span> ${p.nome_completo}`;
                }
            }
        });

    } catch (e) {
        console.error("Erro ao verificar atrasos:", e);
    }
}

async function gerarTabelaMensalidadesReal(pessoa) {
    const tbody = document.getElementById('tabelaMensalidadesAssociado');
    tbody.innerHTML = '<tr><td colspan="5" style="padding: 24px; text-align: center; color: var(--text-muted);">Carregando pagamentos...</td></tr>';

    const ano = document.getElementById('filtroAnoMensalidade').value;

    // Buscar transações de mensalidade deste usuário neste ano
    // Vamos buscar tudo que tem categoria = 'Mensalidade' e o CPF do usuário
    // Como a competência é MM/AAAA, usamos like '%/AAAA'
    let pagamentos = [];
    try {
        const { data } = await db.from('fin_transacoes')
            .select('*')
            .eq('cpf', pessoa.cpf_cnpj)
            .eq('categoria', 'Mensalidade')
            .like('competencia', `%/${ano}`);
        pagamentos = data || [];
    } catch (e) {
        console.error(e);
    }

    const cfgValor = parseFloat(document.getElementById('cfgValorMensalidade').value) || 0;
    const cfgDia = parseInt(document.getElementById('cfgDiaVencimento').value) || 10;

    tbody.innerHTML = '';
    const mesesStr = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

    const dataAtual = new Date();

    mesesStr.forEach((nomeMes, index) => {
        const numMes = (index + 1).toString().padStart(2, '0');
        const comp = `${numMes}/${ano}`;

        // Achar se tem pagamento
        const pgto = pagamentos.find(p => p.competencia === comp);

        const dataVencimento = new Date(ano, index, cfgDia);
        const estaAtrasado = !pgto && dataAtual > dataVencimento;

        let statusStr = '<span style="color: var(--text-muted);">A Vencer</span>';
        let btnAcao = `<button class="btn btn-primary" onclick="darBaixaMensalidade('${pessoa.cpf_cnpj}', '${pessoa.nome_completo}', '${comp}', ${cfgValor})" style="padding: 4px 12px; font-size: 12px; background: #10b981;">💵 Dar Baixa</button>`;
        let dataPagtoStr = '-';
        let valorExibido = cfgValor > 0 ? `R$ ${cfgValor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-';

        if (pgto) {
            statusStr = '<span style="color: #10b981; font-weight: 600;">Pago</span>';
            btnAcao = `<span style="color: var(--text-muted); font-size: 12px;">✅ Recebido</span>`;
            valorExibido = `R$ ${parseFloat(pgto.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            if (pgto.data_pagamento) {
                const pDate = pgto.data_pagamento.split('-');
                dataPagtoStr = `${pDate[2]}/${pDate[1]}/${pDate[0]}`;
            }
        } else if (estaAtrasado) {
            statusStr = '<span style="color: #ef4444; font-weight: 600;">Atrasado</span>';
        }

        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid var(--border)';
        // Adicionamos classe 'linha-atrasada' se estiver atrasado para contarmos depois
        if (estaAtrasado) tr.classList.add('linha-atrasada');
        tr.setAttribute('data-mes', `${numMes}/${ano}`);

        tr.innerHTML = `
            <td style="padding: 12px 16px; font-size: 14px;">${nomeMes}/${ano}</td>
            <td style="padding: 12px 16px; font-size: 14px;">${valorExibido}</td>
            <td style="padding: 12px 16px; font-size: 14px;">${statusStr}</td>
            <td style="padding: 12px 16px; font-size: 14px; color: var(--text-muted);">${dataPagtoStr}</td>
            <td style="padding: 12px 16px; text-align: right;">${btnAcao}</td>
        `;
        tbody.appendChild(tr);
    });
}

// Função global para abrir o modal de baixa
window.darBaixaMensalidade = function (cpf_cnpj, nome, competencia, valor) {
    if (!valor || valor <= 0) {
        alert("O associado não tem valor de mensalidade configurado. Configure no topo antes de dar baixa.");
        return;
    }

    document.getElementById('lblBaixaCompetencia').innerText = competencia;
    document.getElementById('inBaixaValor').value = valor;

    document.getElementById('inBaixaCpf').value = cpf_cnpj;
    document.getElementById('inBaixaNome').value = nome;
    document.getElementById('inBaixaCompetencia').value = competencia;

    document.getElementById('modalBaixaMensalidade').style.display = 'flex';
};

// Escutar o envio do modal de baixa
document.addEventListener('DOMContentLoaded', () => {
    const formBaixa = document.getElementById('formBaixaMensalidade');
    if (formBaixa) {
        formBaixa.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('btnConfirmarBaixa');
            const originalText = btn.innerText;
            btn.innerText = 'Processando...';
            btn.disabled = true;

            try {
                const transacao = {
                    cpf: document.getElementById('inBaixaCpf').value,
                    tipo: 'Receita',
                    valor: parseFloat(document.getElementById('inBaixaValor').value),
                    competencia: document.getElementById('inBaixaCompetencia').value,
                    categoria: 'Mensalidade',
                    descricao: `Mensalidade ${document.getElementById('inBaixaCompetencia').value}`,
                    nome_livre: document.getElementById('inBaixaNome').value,
                    status: 'Pago',
                    data_pagamento: new Date().toISOString().split('T')[0]
                };

                const { error } = await db.from('fin_transacoes').insert([transacao]);
                if (error) throw error;

                document.getElementById('modalBaixaMensalidade').style.display = 'none';

                // Recarrega a tabela de mensalidades
                if (associadoAtivo) {
                    gerarTabelaMensalidadesReal(associadoAtivo);
                }

            } catch (err) {
                console.error(err);
                alert("Erro ao dar baixa: " + err.message);
            } finally {
                btn.innerText = originalText;
                btn.disabled = false;
            }
        });
    }
});

// Cobrar Atrasos (WhatsApp)
document.addEventListener('DOMContentLoaded', () => {
    const btnCobrar = document.getElementById('btnCobrarAtrasos');
    if (btnCobrar) {
        btnCobrar.addEventListener('click', async () => {
            if (!associadoAtivo) return;

            // Descobrir quais meses estão atrasados na tabela
            const atrasos = [];
            document.querySelectorAll('#tabelaMensalidadesAssociado tr.linha-atrasada').forEach(tr => {
                atrasos.push(tr.getAttribute('data-mes'));
            });

            if (atrasos.length === 0) {
                alert("Este associado não possui mensalidades atrasadas neste ano.");
                return;
            }

            let celular = associadoAtivo.celular;
            if (!celular) {
                const num = prompt(`O cadastro de ${associadoAtivo.nome_completo} não possui celular. Digite o número com DDD para continuar:`);
                if (!num) return;
                celular = num;
            }

            // Puxa template do banco
            let template = "Olá, {nome}, tudo bem?\\nEste é um lembrete amigável sobre a sua mensalidade de R$ {valor} com vencimento dia {dia}, do(s) mês(es) {meses}.";
            try {
                const { data } = await db.from('configuracoes').select('valor').eq('chave', 'msg_cobranca_mensalidade').single();
                if (data && data.valor) template = data.valor;
            } catch (e) {
                console.log("Usando template padrão.");
            }

            const valor = document.getElementById('cfgValorMensalidade').value;
            const dia = document.getElementById('cfgDiaVencimento').value;

            // Substituições
            let msg = template
                .replace(/{nome}/g, associadoAtivo.nome_completo)
                .replace(/{valor}/g, parseFloat(valor).toFixed(2).replace('.', ','))
                .replace(/{dia}/g, dia)
                .replace(/{meses}/g, atrasos.join(', '));

            // Converte o \n literal do banco de dados para quebra de linha real
            msg = msg.replace(/\\n/g, '\n');

            // Limpa o celular
            let celLimpo = String(celular).replace(/\D/g, '');
            if (celLimpo.length <= 11) celLimpo = '55' + celLimpo;

            const url = `https://wa.me/${celLimpo}?text=${encodeURIComponent(msg)}`;
            window.open(url, '_blank');
        });
    }

    const btnExtrato = document.getElementById('btnEnviarExtrato');
    if (btnExtrato) {
        btnExtrato.addEventListener('click', async () => {
            if (!associadoAtivo) {
                alert("Selecione um associado primeiro.");
                return;
            }

            let celular = associadoAtivo.celular;
            if (!celular) {
                celular = prompt(`O cadastro de ${associadoAtivo.nome_completo} não possui celular. Digite o número com DDD para continuar:`);
                if (!celular) return;
            }

            let template = "Muito obrigado pelas suas contribuições ao longo deste ano! Segue o seu extrato.";
            try {
                const { data } = await db.from('configuracoes').select('valor').eq('chave', 'msg_agradecimento_anual').single();
                if (data && data.valor) template = data.valor;
            } catch (e) {
                console.log("Usando template padrão para extrato.");
            }

            let msg = template.replace('{nome}', associadoAtivo.nome_completo.split(' ')[0]);
            msg = msg.replace(/\\n/g, '\n');

            let celLimpo = String(celular).replace(/\D/g, '');
            if (celLimpo.length <= 11) celLimpo = '55' + celLimpo;

            // 1. Gera o PDF do Extrato Anual
            const anoAtual = new Date().getFullYear();
            const { data: transacoes } = await db.from('fin_transacoes')
                .select('*')
                .eq('pessoa_id', associadoAtivo.id)
                .eq('status', 'Pago')
                .like('data_pagamento', `${anoAtual}-%`)
                .order('data_pagamento', { ascending: true });

            let trs = '';
            let total = 0;
            if (transacoes && transacoes.length > 0) {
                transacoes.forEach(t => {
                    const dataP = t.data_pagamento ? t.data_pagamento.split('-').reverse().join('/') : '-';
                    const v = parseFloat(t.valor) || 0;
                    total += v;
                    trs += `
                        <tr>
                            <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">${dataP}</td>
                            <td style="padding: 8px; border: 1px solid #cbd5e1;">${t.descricao || 'Mensalidade'}</td>
                            <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        </tr>
                    `;
                });
            } else {
                trs = `<tr><td colspan="3" style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">Nenhuma contribuição encontrada neste ano.</td></tr>`;
            }

            const htmlExtrato = `
                <table style="width: 100%; border-collapse: collapse; margin-top: 30px;">
                    <thead>
                        <tr>
                            <th style="padding: 12px; border: 1px solid #cbd5e1; background: #f1f5f9; text-align: center; width: 150px;">Data</th>
                            <th style="padding: 12px; border: 1px solid #cbd5e1; background: #f1f5f9; text-align: left;">Descrição / Referência</th>
                            <th style="padding: 12px; border: 1px solid #cbd5e1; background: #f1f5f9; text-align: right; width: 150px;">Valor (R$)</th>
                        </tr>
                    </thead>
                    <tbody>${trs}</tbody>
                    <tfoot>
                        <tr>
                            <td colspan="2" style="padding: 12px; border: 1px solid #cbd5e1; text-align: right; font-weight: bold; background: #f8fafc;">TOTAL:</td>
                            <td style="padding: 12px; border: 1px solid #cbd5e1; text-align: right; font-weight: bold; background: #f8fafc;">R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        </tr>
                    </tfoot>
                </table>
            `;

            const urlLogo = window.location.origin + window.location.pathname.replace('index.html', '') + 'logo_sela.png';

            const printWin = window.open('', '_blank');
            printWin.document.write(`
                <html>
                    <head>
                        <title>Extrato Anual - ${associadoAtivo.nome_completo}</title>
                        <style>
                            body { font-family: Arial, sans-serif; color: black; margin: 40px; }
                            .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #ccc; padding-bottom: 20px; margin-bottom: 30px; }
                            .header-logo { display: flex; align-items: center; gap: 16px; }
                            .header-logo img { height: 60px; }
                            .header-logo div { font-weight: bold; font-size: 16px; line-height: 1.2; }
                            .header-title { text-align: right; }
                            .header-title h1 { margin: 0; font-size: 18px; text-transform: uppercase; }
                            .header-title p { margin: 4px 0 0; color: #555; font-size: 14px; }
                            .associado-info { font-size: 14px; line-height: 1.6; }
                            .alert-info { margin-top: 30px; padding: 16px; background: #eff6ff; color: #1e3a8a; border-radius: 8px; font-weight: 500; font-family: sans-serif; }
                            @media print { .alert-info { display: none !important; } }
                        </style>
                    </head>
                    <body>
                        <div class="alert-info">
                            1. Salve esta página como PDF. <br>
                            2. Volte para a aba do sistema para enviar a mensagem do WhatsApp. <br>
                            3. Anexe o PDF salvo na conversa do WhatsApp!
                        </div>
                        <div class="header">
                            <div class="header-logo">
                                <img src="${urlLogo}" alt="Logo SELA">
                                <div>SOCIEDADE ESPÍRITA<br>LUZ DO AMANHECER</div>
                            </div>
                            <div class="header-title">
                                <h1>EXTRATO DE CONTRIBUIÇÕES</h1>
                                <p>ANO: ${anoAtual}</p>
                            </div>
                        </div>
                        <div class="associado-info">
                            <strong>Associado(a):</strong> ${associadoAtivo.nome_completo}<br>
                            <strong>CPF/CNPJ:</strong> ${associadoAtivo.cpf_cnpj || 'Não informado'}
                        </div>
                        ${htmlExtrato}
                        
                        <div style="margin-top: 80px; display: flex; justify-content: space-around; text-align: center;">
                            <div>
                                <div style="border-bottom: 1px solid black; width: 250px; margin-bottom: 8px;"></div>
                                <div style="font-size: 14px;">Tesouraria</div>
                            </div>
                            <div>
                                <div style="border-bottom: 1px solid black; width: 250px; margin-bottom: 8px;"></div>
                                <div style="font-size: 14px;">Diretoria Executiva</div>
                            </div>
                        </div>
                    </body>
                </html>
            `);
            printWin.document.close();

            // 2. Aguarda um pouco e aciona a impressão, depois abre o WhatsApp
            setTimeout(() => {
                printWin.print();

                setTimeout(() => {
                    const link = `https://wa.me/${celLimpo}?text=${encodeURIComponent(msg)}`;
                    window.open(link, '_blank');
                }, 1000);
            }, 500);
        });
    }
});

// Event Listeners para botões Pix
document.querySelectorAll('.btn-pix').forEach(btn => {
    btn.addEventListener('click', async () => {
        if (!associadoAtivo) {
            alert("Selecione um associado na lista primeiro!");
            return;
        }

        let celular = associadoAtivo.celular;
        if (!celular) {
            celular = prompt(`O cadastro de ${associadoAtivo.nome_completo} não possui celular. Digite o número com DDD para continuar:`);
            if (!celular) return;
        }

        let celLimpo = String(celular).replace(/\D/g, '');
        if (celLimpo.length <= 11) celLimpo = '55' + celLimpo;

        const valor = btn.getAttribute('data-valor');

        const payloadsPix = {
            '10': '00020101021126640014br.gov.bcb.pix0114070321760001740224mensalidade associado 10520400005303986540510.005802BR5925Sociedade Espirita Luz Do6008BRASILIA62170513mensalidade10630400B4',
            '20': '00020101021126640014br.gov.bcb.pix0114070321760001740224mensalidade associado 20520400005303986540520.005802BR5925Sociedade Espirita Luz Do6008BRASILIA62170513mensalidade20630485FD',
            '25': '00020101021126640014br.gov.bcb.pix0114070321760001740224mensalidade associado 25520400005303986540525.005802BR5925Sociedade Espirita Luz Do6008BRASILIA62170513mensalidade25630434D5',
            '30': '00020101021126640014br.gov.bcb.pix0114070321760001740224mensalidade associado 30520400005303986540530.005802BR5925Sociedade Espirita Luz Do6008BRASILIA62170513mensalidade3063040925',
            '50': '00020101021126640014br.gov.bcb.pix0114070321760001740224mensalidade associado 50520400005303986540550.005802BR5925Sociedade Espirita Luz Do6008BRASILIA62170513mensalidade5063041396',
            '100': '00020101021126650014br.gov.bcb.pix0114070321760001740225mensalidade associado 1005204000053039865406100.005802BR5925Sociedade Espirita Luz Do6008BRASILIA62180514mensalidade100630450B9',
            '250': '00020101021126650014br.gov.bcb.pix0114070321760001740225mensalidade associado 2505204000053039865406250.005802BR5925Sociedade Espirita Luz Do6008BRASILIA62180514mensalidade25063045CA1'
        };

        const codigo = payloadsPix[valor];
        const nomeCurto = associadoAtivo.nome_completo.split(' ')[0];

        const msgTexto = `Olá, ${nomeCurto}!\nEste é um lembrete amigável sobre a sua mensalidade de R$ ${valor},00.\nVou enviar a chave Pix "Copia e Cola" na próxima mensagem para facilitar a cópia!\n\n*A Sociedade Espírita Luz do Amanhã agradece!*`;
        const msgCodigo = codigo;

        // Exibir modal de escolha
        document.getElementById('pixModalNome').innerText = nomeCurto;
        document.getElementById('modalPixOptions').style.display = 'flex';

        // Remove listeners antigos para evitar chamadas múltiplas
        const btnTexto = document.getElementById('btnPixTexto');
        const btnCodigo = document.getElementById('btnPixCodigo');

        btnTexto.onclick = () => {
            const link = `https://wa.me/${celLimpo}?text=${encodeURIComponent(msgTexto)}`;
            window.open(link, '_blank');
            document.getElementById('modalPixOptions').style.display = 'none';
        };

        btnCodigo.onclick = () => {
            const link = `https://wa.me/${celLimpo}?text=${encodeURIComponent(msgCodigo)}`;
            window.open(link, '_blank');
            document.getElementById('modalPixOptions').style.display = 'none';
        };
    });
});

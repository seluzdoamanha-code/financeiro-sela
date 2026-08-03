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
            .select('id, cpf_cnpj, nome_completo, email, papeis')
            .contains('papeis', ['Associado Efetivo'])
            .order('nome_completo', { ascending: true });
            
        if (error) throw error;
        
        lista.innerHTML = '';
        
        if (!pessoas || pessoas.length === 0) {
            lista.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 13px;">Nenhuma pessoa encontrada.</div>';
            return;
        }
        
        pessoas.forEach(p => {
            const div = document.createElement('div');
            div.className = 'assoc-item';
            div.innerHTML = `
                <div style="flex: 1;">
                    <div style="font-weight: 500;">${p.nome_completo}</div>
                    <div style="font-size: 11px; color: var(--text-muted);">${p.cpf_cnpj || p.email || 'Sem CPF'}</div>
                </div>
            `;
            
            div.addEventListener('click', () => selecionarAssociado(p, div));
            
            lista.appendChild(div);
        });
        
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
    } catch (err) {
        console.error(err);
        alert('Erro ao salvar configuração: ' + err.message);
        btn.innerText = 'Salvar Configuração';
        btn.disabled = false;
    }
});

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
        let valorExibido = cfgValor > 0 ? `R$ ${cfgValor.toFixed(2).replace('.',',')}` : '-';
        
        if (pgto) {
            statusStr = '<span style="color: #10b981; font-weight: 600;">Pago</span>';
            btnAcao = `<span style="color: var(--text-muted); font-size: 12px;">✅ Recebido</span>`;
            valorExibido = `R$ ${parseFloat(pgto.valor).toFixed(2).replace('.',',')}`;
            if (pgto.data_pagamento) {
                const pDate = pgto.data_pagamento.split('-');
                dataPagtoStr = `${pDate[2]}/${pDate[1]}/${pDate[0]}`;
            }
        } else if (estaAtrasado) {
            statusStr = '<span style="color: #ef4444; font-weight: 600;">Atrasado</span>';
        }
        
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid var(--border)';
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

// Função global para dar baixa
window.darBaixaMensalidade = async function(cpf_cnpj, nome, competencia, valor) {
    if (!valor || valor <= 0) {
        alert("O associado não tem valor de mensalidade configurado. Configure no topo antes de dar baixa.");
        return;
    }
    
    if (!confirm(`Confirma o recebimento da mensalidade de ${competencia} no valor de R$ ${valor}?`)) return;
    
    try {
        const transacao = {
            cpf: cpf_cnpj,
            tipo: 'Receita',
            valor: valor,
            competencia: competencia,
            categoria: 'Mensalidade',
            descricao: `Mensalidade ${competencia}`,
            nome_livre: nome,
            status: 'Pago',
            data_pagamento: new Date().toISOString().split('T')[0]
        };
        
        const { error } = await db.from('fin_transacoes').insert([transacao]);
        if (error) throw error;
        
        // Recarrega a tabela de mensalidades para mostrar como "Pago"
        if (associadoAtivo) {
            gerarTabelaMensalidadesReal(associadoAtivo);
        }
        
    } catch (err) {
        console.error(err);
        alert("Erro ao dar baixa: " + err.message);
    }
};

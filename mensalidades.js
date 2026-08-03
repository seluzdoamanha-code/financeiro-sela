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
            .select('id, cpf_cnpj, nome_completo, email')
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
    
    // TODO: Buscar configuração na tabela 'fin_config_mensalidades' (cpf, valor, dia_vencimento, inicio)
    // E depois buscar em 'fin_transacoes' os pagamentos para gerar os 12 meses.
    
    // Mockup visual temporário enquanto criamos a tabela no Supabase
    setTimeout(() => {
        document.getElementById('cfgValorMensalidade').value = '50.00';
        document.getElementById('cfgDiaVencimento').value = '10';
        document.getElementById('cfgInicio').value = '01/2026';
        renderizarMesesMockup();
    }, 500);
}

function renderizarMesesMockup() {
    const tbody = document.getElementById('tabelaMensalidadesAssociado');
    tbody.innerHTML = '';
    
    const mesesStr = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const ano = document.getElementById('filtroAnoMensalidade').value;
    
    mesesStr.forEach((nomeMes, index) => {
        const numMes = (index + 1).toString().padStart(2, '0');
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid var(--border)';
        
        // Mockup de status para demonstração visual
        let statusStr = '<span style="color: var(--text-muted);">A Vencer</span>';
        let btnAcao = `<button class="btn btn-primary" style="padding: 4px 12px; font-size: 12px; background: #10b981;">💵 Dar Baixa</button>`;
        
        if (index < 3) {
            statusStr = '<span style="color: #ef4444; font-weight: 600;">Atrasado</span>';
        } else if (index === 3) {
            statusStr = '<span style="color: #10b981; font-weight: 600;">Pago</span>';
            btnAcao = `<span style="color: var(--text-muted); font-size: 12px;">✅ Recebido</span>`;
        }
        
        tr.innerHTML = `
            <td style="padding: 12px 16px; font-size: 14px;">${nomeMes}/${ano}</td>
            <td style="padding: 12px 16px; font-size: 14px;">R$ 50,00</td>
            <td style="padding: 12px 16px; font-size: 14px;">${statusStr}</td>
            <td style="padding: 12px 16px; font-size: 14px; color: var(--text-muted);">${index === 3 ? '10/04/2026' : '-'}</td>
            <td style="padding: 12px 16px; text-align: right;">${btnAcao}</td>
        `;
        tbody.appendChild(tr);
    });
}

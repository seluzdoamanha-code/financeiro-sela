document.addEventListener('DOMContentLoaded', () => {
    
    window.regrasOfx = [];
    const menuConfiguracoes = document.getElementById('menuConfiguracoes');
    const viewConfiguracoes = document.getElementById('viewConfiguracoes');
    
    if (menuConfiguracoes) {
        menuConfiguracoes.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
            menuConfiguracoes.classList.add('active');
            
            document.querySelectorAll('.content-body').forEach(el => el.style.display = 'none');
            viewConfiguracoes.style.display = 'block';
            
            document.getElementById('pageTitle').innerText = 'Configurações';
            document.getElementById('pageSubtitle').innerText = 'Templates do WhatsApp e customização visual.';
            
            carregarConfiguracoes();
        });
    }

    // Abas de Configuração
    document.querySelectorAll('.config-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.config-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            document.querySelectorAll('.config-content').forEach(c => c.style.display = 'none');
            document.getElementById(tab.getAttribute('data-target')).style.display = 'block';
        });
    });

    // Preview de cor em tempo real
    const corPrimaria = document.getElementById('cfgCorPrimaria');
    const corPrimariaHex = document.getElementById('cfgCorPrimariaHex');
    
    if (corPrimaria && corPrimariaHex) {
        corPrimaria.addEventListener('input', (e) => {
            corPrimariaHex.value = e.target.value;
            document.documentElement.style.setProperty('--primary', e.target.value);
        });
        
        corPrimariaHex.addEventListener('input', (e) => {
            if (/^#[0-9A-F]{6}$/i.test(e.target.value)) {
                corPrimaria.value = e.target.value;
                document.documentElement.style.setProperty('--primary', e.target.value);
            }
        });
    }

    // Botão Salvar
    document.getElementById('btnSalvarConfigGeral').addEventListener('click', salvarConfiguracoes);
});

async function carregarConfiguracoes() {
    try {
        const { data, error } = await db.from('configuracoes').select('*');
        if (error) throw error;

        // Se encontrou dados, preenche os campos
        if (data && data.length > 0) {
            data.forEach(cfg => {
                if (cfg.chave === 'msg_cobranca_mensalidade' && cfg.valor) {
                    document.getElementById('cfgMsgLembrete').value = cfg.valor;
                }
                if (cfg.chave === 'msg_comunicado' && cfg.valor) {
                    document.getElementById('cfgMsgComunicado').value = cfg.valor;
                }
                if (cfg.chave === 'msg_agradecimento' && cfg.valor) {
                    document.getElementById('cfgMsgAgradecimento').value = cfg.valor;
                }
                if (cfg.chave === 'tema_cor_primaria' && cfg.valor) {
                    document.getElementById('cfgCorPrimaria').value = cfg.valor;
                    document.getElementById('cfgCorPrimariaHex').value = cfg.valor;
                    document.documentElement.style.setProperty('--primary', cfg.valor);
                }
                if (cfg.chave === 'fin_plano_receitas' && cfg.valor) {
                    document.getElementById('cfgPlanoContasReceitas').value = cfg.valor;
                }
                if (cfg.chave === 'fin_plano_despesas' && cfg.valor) {
                    document.getElementById('cfgPlanoContasDespesas').value = cfg.valor;
                }
                if (cfg.chave === 'fin_regras_ofx' && cfg.valor) {
                    try { window.regrasOfx = JSON.parse(cfg.valor); } catch(e) { window.regrasOfx = []; }
                }
            });
            
            // Popula o select de regras OFX
            let rec = document.getElementById('cfgPlanoContasReceitas').value;
            let desp = document.getElementById('cfgPlanoContasDespesas').value;
            atualizarSelectCategoriasOfx(rec, desp);
            renderizarTabelaRegrasOfx();
        }
    } catch (err) {
        console.error("Erro ao carregar configurações:", err);
    }
}

async function salvarConfiguracoes() {
    const btn = document.getElementById('btnSalvarConfigGeral');
    btn.innerText = 'Salvando...';
    btn.disabled = true;
    
    const configsToSave = [
        { chave: 'msg_cobranca_mensalidade', valor: document.getElementById('cfgMsgLembrete').value },
        { chave: 'msg_comunicado', valor: document.getElementById('cfgMsgComunicado').value },
        { chave: 'msg_agradecimento', valor: document.getElementById('cfgMsgAgradecimento').value },
        { chave: 'tema_cor_primaria', valor: document.getElementById('cfgCorPrimariaHex').value },
        { chave: 'fin_plano_receitas', valor: document.getElementById('cfgPlanoContasReceitas').value },
        { chave: 'fin_plano_despesas', valor: document.getElementById('cfgPlanoContasDespesas').value },
        { chave: 'fin_regras_ofx', valor: JSON.stringify(window.regrasOfx || []) }
    ];
    
    try {
        const { error } = await db.from('configuracoes').upsert(configsToSave, { onConflict: 'chave' });
        if (error) throw error;
        
        btn.innerText = 'Salvo!';
        btn.style.background = '#10b981';
        
        setTimeout(() => {
            btn.innerText = 'Salvar Alterações';
            btn.style.background = '';
            btn.disabled = false;
        }, 2000);
        
    } catch (err) {
        console.error("Erro ao salvar:", err);
        alert('Erro ao salvar configurações: ' + err.message);
        btn.innerText = 'Salvar Alterações';
        btn.disabled = false;
    }
}

function atualizarSelectCategoriasOfx(receitas, despesas) {
    const sel = document.getElementById('cfgRegraOfxCategory');
    if (!sel) return;
    
    sel.innerHTML = '<option value="">-- Selecione a Categoria --</option>';
    const recArr = (receitas || "").split('\n').map(s => s.trim()).filter(s => s);
    const despArr = (despesas || "").split('\n').map(s => s.trim()).filter(s => s);
    
    const todas = [...recArr, ...despArr].sort();
    todas.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.innerText = c;
        sel.appendChild(opt);
    });
}

function renderizarTabelaRegrasOfx() {
    const tbody = document.getElementById('tabelaRegrasOfxBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    if (!window.regrasOfx || window.regrasOfx.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 24px; color: var(--text-muted);">Nenhuma regra cadastrada.</td></tr>';
        return;
    }
    
    window.regrasOfx.forEach((regra, index) => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = "1px solid var(--border)";
        tr.innerHTML = `
            <td style="padding: 12px 16px;"><b>${regra.keyword}</b></td>
            <td style="padding: 12px 16px;">${regra.category}</td>
            <td style="padding: 12px 16px; text-align: center;">
                <button onclick="removerRegraOfx(${index})" style="background: none; border: none; color: #ef4444; cursor: pointer; font-weight: 500;">❌ Remover</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.adicionarRegraOfx = function() {
    const key = document.getElementById('cfgRegraOfxKeyword').value.trim();
    const cat = document.getElementById('cfgRegraOfxCategory').value.trim();
    
    if (!key || !cat) {
        alert("Preencha a Palavra-Chave e selecione a Categoria!");
        return;
    }
    
    if (!window.regrasOfx) window.regrasOfx = [];
    
    // Evita duplicatas exatas
    const existe = window.regrasOfx.find(r => r.keyword.toLowerCase() === key.toLowerCase() && r.category === cat);
    if (existe) {
        alert("Essa regra já existe!");
        return;
    }
    
    window.regrasOfx.push({ keyword: key, category: cat });
    document.getElementById('cfgRegraOfxKeyword').value = '';
    document.getElementById('cfgRegraOfxCategory').value = '';
    
    renderizarTabelaRegrasOfx();
};

window.removerRegraOfx = function(index) {
    if (confirm("Remover esta regra?")) {
        window.regrasOfx.splice(index, 1);
        renderizarTabelaRegrasOfx();
    }
};

// Carregar cor primária logo no boot do app
window.addEventListener('financeiro:auth-success', async () => {
    try {
        const { data } = await db.from('configuracoes').select('valor').eq('chave', 'tema_cor_primaria').single();
        if (data && data.valor) {
            document.documentElement.style.setProperty('--primary', data.valor);
        }
    } catch (e) {}
});

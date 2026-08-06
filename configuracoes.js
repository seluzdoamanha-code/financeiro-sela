document.addEventListener('DOMContentLoaded', () => {
    
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
            });
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
        { chave: 'fin_plano_despesas', valor: document.getElementById('cfgPlanoContasDespesas').value }
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

// Carregar cor primária logo no boot do app
window.addEventListener('financeiro:auth-success', async () => {
    try {
        const { data } = await db.from('configuracoes').select('valor').eq('chave', 'tema_cor_primaria').single();
        if (data && data.valor) {
            document.documentElement.style.setProperty('--primary', data.valor);
        }
    } catch (e) {}
});

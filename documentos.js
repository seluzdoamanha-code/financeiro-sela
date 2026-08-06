document.addEventListener('DOMContentLoaded', () => {
    const menuDocumentos = document.getElementById('menuDocumentos');
    const viewDocumentos = document.getElementById('viewDocumentos');
    
    if (menuDocumentos) {
        menuDocumentos.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
            menuDocumentos.classList.add('active');
            
            document.querySelectorAll('.content-body').forEach(el => el.style.display = 'none');
            viewDocumentos.style.display = 'block';
            
            document.getElementById('pageTitle').innerText = 'Documentos e Arquivos';
            document.getElementById('pageSubtitle').innerText = 'Repositório central de recibos, comprovantes e OFXs.';
            
            carregarDocumentos();
        });
    }

    const btnFiltrarDocs = document.getElementById('btnFiltrarDocs');
    if (btnFiltrarDocs) {
        btnFiltrarDocs.addEventListener('click', carregarDocumentos);
    }

    // Removido listener do btnNovoDocumento pois agora usa onclick no HTML

    const formUploadDocumento = document.getElementById('formUploadDocumento');
    if (formUploadDocumento) {
        formUploadDocumento.addEventListener('submit', salvarNovoDocumento);
    }
});

window.abrirModalDocumento = function() {
    document.getElementById('formUploadDocumento').reset();
    document.getElementById('modalDocumento').style.display = 'flex';
};

async function carregarDocumentos() {
    const tbody = document.getElementById('tabelaDocumentosBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="5" style="padding: 24px; text-align: center; color: var(--text-muted);">Buscando documentos...</td></tr>';

    const ano = document.getElementById('filtroAnoDoc').value;
    const origem = document.getElementById('filtroOrigemDoc').value;
    const status = document.getElementById('filtroStatusDoc').value;

    try {
        let query = db.from('app_tesouraria_envios').select('*');

        if (ano) {
            query = query.or(`ano_referencia.eq.${parseInt(ano)},ano_referencia.is.null`);
        }
        if (origem) {
            // Se for Portal, no passado salvávamos sem origem. Então tratamos null como Portal também.
            if (origem === 'Portal') {
                query = query.or('origem.eq.Portal,origem.is.null');
            } else {
                query = query.eq('origem', origem);
            }
        }
        if (status) query = query.eq('status', status);

        query = query.order('created_at', { ascending: false });

        const { data, error } = await query;
        if (error) throw error;

        tbody.innerHTML = '';

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="padding: 24px; text-align: center; color: var(--text-muted);">Nenhum documento encontrado com os filtros selecionados.</td></tr>';
            return;
        }

        data.forEach(doc => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
            
            const dataEnvio = new Date(doc.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
            const origemReal = doc.origem || 'Portal'; // Legado vem null
            const origemBadge = getOrigemBadge(origemReal);
            const statusBadge = getStatusBadge(doc.status);
            
            let arquivoLink = '-';
            if (doc.arquivo_url) {
                arquivoLink = `<a href="${doc.arquivo_url}" target="_blank" style="color: var(--primary); text-decoration: none; font-weight: 500;">📎 Ver Arquivo</a>`;
            }

            let acoes = '';
            if (doc.status === 'pendente') {
                acoes = `<button onclick="marcarDocProcessado('${doc.id}')" style="background: var(--success); color: white; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 500;">✓ Arquivar</button>`;
            } else {
                acoes = `<span style="color: var(--text-muted); font-size: 12px;">Já Arquivado</span>`;
            }

            tr.innerHTML = `
                <td style="padding: 16px; font-size: 14px;">
                    <div>${dataEnvio}</div>
                    <div style="margin-top: 4px;">${origemBadge}</div>
                </td>
                <td style="padding: 16px; font-size: 14px;">
                    <div style="font-weight: 500; color: white;">${doc.descricao || '-'}</div>
                    <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">Enviado por: ${doc.remetente_nome || '-'}</div>
                </td>
                <td style="padding: 16px; font-size: 14px;">${arquivoLink}</td>
                <td style="padding: 16px; font-size: 14px; text-align: center;">${statusBadge}</td>
                <td style="padding: 16px; font-size: 14px; text-align: center;">${acoes}</td>
            `;
            tbody.appendChild(tr);
        });

    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="5" style="padding: 24px; text-align: center; color: #ef4444;">Erro ao buscar: ${err.message}</td></tr>`;
    }
}

async function salvarNovoDocumento(e) {
    e.preventDefault();
    const btnSubmit = document.getElementById('btnSalvarDocumento');
    btnSubmit.disabled = true;
    btnSubmit.innerText = 'Fazendo Upload...';

    try {
        const origem = document.getElementById('docOrigem').value;
        const ano_referencia = parseInt(document.getElementById('docAnoRef').value);
        const descricao = document.getElementById('docDescricao').value;
        const status = document.getElementById('docStatus').value;
        const fileInput = document.getElementById('docArquivo');
        
        let arquivoUrl = null;
        if (fileInput.files.length > 0) {
            const file = fileInput.files[0];
            const fileExt = file.name.split('.').pop();
            const fileName = `doc_${origem}_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
            const filePath = `documentos_gerais/${fileName}`;
            
            const { error: uploadError } = await db.storage
                .from('documentos')
                .upload(filePath, file);
                
            if (uploadError) throw uploadError;
            
            const { data: publicUrlData } = db.storage.from('documentos').getPublicUrl(filePath);
            arquivoUrl = publicUrlData.publicUrl;
        } else {
            throw new Error("Selecione um arquivo para arquivar.");
        }

        const { error: dbError } = await db.from('app_tesouraria_envios').insert([{
            origem: origem,
            ano_referencia: ano_referencia,
            descricao: descricao,
            arquivo_url: arquivoUrl,
            remetente_nome: 'Financeiro SELA',
            status: status
        }]);

        if (dbError) throw dbError;

        alert('Documento guardado com sucesso!');
        document.getElementById('modalDocumento').style.display = 'none';
        carregarDocumentos();

    } catch (err) {
        console.error(err);
        alert('Erro ao guardar documento: ' + err.message);
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.innerText = 'Fazer Upload';
    }
}

window.marcarDocProcessado = async function(id) {
    abrirModalConfirmacao(
        "Arquivar Documento", 
        "Deseja marcar este documento como Processado/Arquivado? Ele ficará salvo no Histórico.",
        async () => {
            try {
                // Adicionando .select() para evitar falha silenciosa de RLS
                const { data, error } = await db.from('app_tesouraria_envios')
                                        .update({ status: 'processado' })
                                        .eq('id', id)
                                        .select();
                
                if (error) throw error;
                if (!data || data.length === 0) {
                    throw new Error("Erro de Permissão (RLS): O banco de dados bloqueou silenciosamente sua alteração. A tabela app_tesouraria_envios precisa permitir UPDATE.");
                }
                
                carregarDocumentos();
                
                if (typeof carregarCaixaEntradaTesouraria === 'function') {
                    carregarCaixaEntradaTesouraria();
                }
            } catch (err) {
                alert("Erro ao processar: " + err.message);
            }
        }
    );
};

function getOrigemBadge(origem) {
    if (!origem || origem === 'Portal') {
        return `<span style="background: rgba(16, 185, 129, 0.1); color: #10b981; padding: 2px 8px; border-radius: 12px; font-size: 11px;">Portal SELA</span>`;
    }
    if (origem === 'Financeiro') {
        return `<span style="background: rgba(59, 130, 246, 0.1); color: #3b82f6; padding: 2px 8px; border-radius: 12px; font-size: 11px;">Financeiro</span>`;
    }
    if (origem === 'OFX') {
        return `<span style="background: rgba(139, 92, 246, 0.1); color: #8b5cf6; padding: 2px 8px; border-radius: 12px; font-size: 11px;">OFX</span>`;
    }
    return `<span style="background: rgba(255, 255, 255, 0.1); color: #ccc; padding: 2px 8px; border-radius: 12px; font-size: 11px;">${origem}</span>`;
}

function getStatusBadge(status) {
    if (status === 'processado') {
        return `<span style="color: var(--text-muted);">Processado</span>`;
    }
    return `<span style="color: #ef4444; font-weight: 500;">Pendente</span>`;
}

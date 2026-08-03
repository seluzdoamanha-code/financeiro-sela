const SUPABASE_URL = 'https://aymdooyafimliiggxeqs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF5bWRvb3lhZmltbGlpZ2d4ZXFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxMDUxNDksImV4cCI6MjEwMDY4MTE0OX0.-NBhiyGDlrWq4QKNLx9Ll5GlIk0mV_rBWnr0vdbUCOU';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
    
    // Verificar sessão existente
    const { data: { session } } = await db.auth.getSession();
    
    if (session) {
        // Verifica se a pessoa tem permissão na tabela fin_acessos
        await verificarPermissaoFinanceira(session.user);
    } else {
        // Mostra a tela de login
        document.getElementById('loginOverlay').style.display = 'flex';
        document.getElementById('mainApp').style.display = 'none';
    }

    // Listeners do Login OAuth
    const btnGoogle = document.getElementById('btnGoogleLogin');
    const btnMicrosoft = document.getElementById('btnMicrosoftLogin');
    const erroMsg = document.getElementById('loginError');

    if (btnGoogle) {
        btnGoogle.addEventListener('click', async (e) => {
            e.preventDefault();
            btnGoogle.disabled = true;
            btnGoogle.innerHTML = 'Conectando...';
            
            let indexUrl = window.location.href.split('?')[0];
            
            const { data, error } = await db.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: indexUrl
                }
            });

            if (error) {
                console.error(error);
                btnGoogle.disabled = false;
                btnGoogle.innerHTML = `Entrar com o Google`;
            }
        });
    }

    if (btnMicrosoft) {
        btnMicrosoft.addEventListener('click', async (e) => {
            e.preventDefault();
            btnMicrosoft.disabled = true;
            btnMicrosoft.innerHTML = 'Conectando...';
            
            let indexUrl = window.location.href.split('?')[0];
            
            const { data, error } = await db.auth.signInWithOAuth({
                provider: 'azure',
                options: {
                    redirectTo: indexUrl,
                    scopes: 'email'
                }
            });

            if (error) {
                console.error(error);
                btnMicrosoft.disabled = false;
                btnMicrosoft.innerHTML = `Entrar com a Microsoft`;
            }
        });
    }
    
    // Ouvinte para detectar quando a autenticação muda (OAuth redireciona pra cá)
    db.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session) {
            await verificarPermissaoFinanceira(session.user);
        }
    });
    
    // Listener de Sair (Logout)
    document.getElementById('btnSair').addEventListener('click', async () => {
        await db.auth.signOut();
        window.location.reload();
    });
});

async function verificarPermissaoFinanceira(user) {
    try {
        const { data, error } = await db.from('fin_acessos').select('*').eq('email', user.email).single();
        
        if (error || !data) {
            // Não encontrou na lista VIP
            console.warn('Acesso Bloqueado para:', user.email);
            const erroMsg = document.getElementById('loginError');
            erroMsg.innerText = `Acesso Negado: O e-mail "${user.email}" não pertence à Tesouraria.`;
            erroMsg.style.display = 'block';
            await db.auth.signOut();
            
            document.getElementById('loginOverlay').style.display = 'flex';
            document.getElementById('mainApp').style.display = 'none';
            return;
        }
        
        // Se passou, entra no sistema
        entrarNoSistema(user, data);
        
    } catch (err) {
        console.error('Erro ao verificar permissão:', err);
    }
}

function entrarNoSistema(user, dadosAcesso) {
    currentUser = user;
    
    // Mostrar a interface principal
    document.getElementById('loginOverlay').style.display = 'none';
    document.getElementById('mainApp').style.display = 'flex';
    
    // Atualizar perfil visual
    document.getElementById('userEmailDisplay').innerText = dadosAcesso ? dadosAcesso.nome : user.email;
    const primeiraLetra = (dadosAcesso && dadosAcesso.nome) ? dadosAcesso.nome.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase();
    document.getElementById('userAvatar').innerText = primeiraLetra;
    
    // Disparar um evento global para os outros módulos (.js) saberem que o login ocorreu
    window.dispatchEvent(new Event('financeiro:auth-success'));
}

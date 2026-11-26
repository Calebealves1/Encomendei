import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { ExternalLink, MailCheck, RefreshCw } from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { useAuth } from '../hooks/useAuth';
import { firebaseProjectId } from '../lib/firebase';

type ModoAuth = 'login' | 'cadastro' | 'recuperar';

interface ErroTraduzido {
  mensagem: string;
  mostrarNovaAba?: boolean;
}

function extrairCodigoFirebase(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string' && code.length > 0) {
      return code;
    }
  }
  const msg = err instanceof Error ? err.message : String(err);
  const match = msg.match(/auth\/[a-z0-9-]+/i);
  return match ? match[0] : '';
}

export function AuthPage() {
  const {
    user,
    emailVerificado,
    authPronto,
    entrarComEmail,
    cadastrarComEmail,
    entrarComGoogle,
    enviarRecuperacaoSenha,
    reenviarVerificacao,
    recarregarUsuario,
    sair,
  } = useAuth();

  const [modo, setModo] = useState<ModoAuth>('login');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [verificandoEmail, setVerificandoEmail] = useState(false);
  const [reenviandoEmail, setReenviandoEmail] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [sugerirNovaAba, setSugerirNovaAba] = useState(false);

  const ultimaVerificacaoRef = useRef<number>(0);
  const emIframe = typeof window !== 'undefined' && window.self !== window.top;
  const hostnameAtual = typeof window !== 'undefined' ? window.location.hostname : '';

  useEffect(() => {
    if (!authPronto || !user || emailVerificado) return;

    const verificarAoFocar = () => {
      if (document.visibilityState === 'hidden') return;
      const agora = Date.now();
      if (agora - ultimaVerificacaoRef.current < 3000) return;
      ultimaVerificacaoRef.current = agora;
      void recarregarUsuario().catch(() => {
        // Verificação silenciosa no retorno à aba; botão manual exibe erros se necessário
      });
    };

    window.addEventListener('focus', verificarAoFocar);
    document.addEventListener('visibilitychange', verificarAoFocar);
    return () => {
      window.removeEventListener('focus', verificarAoFocar);
      document.removeEventListener('visibilitychange', verificarAoFocar);
    };
  }, [authPronto, user, emailVerificado, recarregarUsuario]);

  if (authPronto && user && emailVerificado) {
    return <Navigate to="/painel" replace />;
  }

  const traduzirErroAuth = (err: unknown): ErroTraduzido => {
    const code = extrairCodigoFirebase(err);
    const projetoLabel = firebaseProjectId ? ` (${firebaseProjectId})` : '';

    switch (code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return { mensagem: 'E-mail ou senha incorretos.' };
      case 'auth/invalid-email':
        return { mensagem: 'Formato de e-mail inválido. Verifique o endereço informado.' };
      case 'auth/email-already-in-use':
        return {
          mensagem:
            'Já existe uma conta cadastrada com este e-mail. Use a aba "Entrar" ou clique em "Continuar com Google".',
        };
      case 'auth/weak-password':
        return { mensagem: 'A senha precisa ter pelo menos 6 caracteres.' };
      case 'auth/operation-not-allowed':
        return {
          mensagem: `O método de login por E-mail/Senha ainda não foi ativado no Firebase Console${projetoLabel}. Acesse Authentication → Sign-in method, ative "E-mail/senha" e salve para habilitar o cadastro por e-mail.`,
        };
      case 'auth/unauthorized-domain':
        return {
          mensagem: `O domínio atual (${hostnameAtual || 'preview'}) ainda não está autorizado no Firebase Console${projetoLabel}. Adicione-o em Authentication → Settings → Authorized domains.`,
          mostrarNovaAba: emIframe,
        };
      case 'auth/popup-blocked':
        return {
          mensagem:
            'O navegador ou a janela de visualização bloqueou o popup do Google. Libere popups para este endereço ou abra a página de acesso em uma nova aba.',
          mostrarNovaAba: true,
        };
      case 'auth/popup-closed-by-user':
      case 'auth/cancelled-popup-request':
        return {
          mensagem: emIframe
            ? 'A janela de login com Google foi fechada ou interrompida antes da conclusão. Em janelas incorporadas, o navegador pode encerrar o popup — tente novamente ou abra o login em uma nova aba.'
            : 'A janela de login com Google foi fechada antes da conclusão. Tente novamente e conclua a seleção da conta.',
          mostrarNovaAba: emIframe,
        };
      case 'auth/account-exists-with-different-credential':
        return {
          mensagem:
            'Este e-mail já está vinculado a outro método de login (como Google ou E-mail/Senha). Entre usando o método original.',
        };
      case 'auth/too-many-requests':
        return {
          mensagem: 'Muitas tentativas em sequência. Aguarde alguns minutos antes de tentar novamente.',
        };
      case 'auth/network-request-failed':
        return {
          mensagem: 'Falha de rede ao conectar com o serviço de autenticação. Verifique sua conexão e tente novamente.',
        };
      case 'auth/user-disabled':
        return { mensagem: 'Esta conta foi desativada.' };
      default:
        return {
          mensagem: code
            ? `Não foi possível autenticar (${code}). Verifique os dados e tente novamente.`
            : 'Não foi possível autenticar. Verifique os dados e tente novamente.',
        };
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErro(null);
    setSucesso(null);
    setSugerirNovaAba(false);

    if (modo === 'cadastro' && nome.trim().length < 2) {
      setErro('Informe seu nome com pelo menos 2 caracteres.');
      return;
    }

    setCarregando(true);
    try {
      if (modo === 'login') {
        await entrarComEmail(email, senha);
      } else if (modo === 'cadastro') {
        await cadastrarComEmail(nome, email, senha);
        setSucesso('Conta criada! Enviamos um link de confirmação para o seu e-mail.');
      } else {
        await enviarRecuperacaoSenha(email);
        setSucesso('Se o e-mail estiver cadastrado, enviamos instruções de recuperação.');
      }
    } catch (err) {
      const traduzido = traduzirErroAuth(err);
      setErro(traduzido.mensagem);
      setSugerirNovaAba(Boolean(traduzido.mostrarNovaAba));
    } finally {
      setCarregando(false);
    }
  };

  const handleGoogle = async () => {
    setErro(null);
    setSucesso(null);
    setSugerirNovaAba(false);
    setCarregando(true);
    try {
      await entrarComGoogle();
    } catch (err) {
      const traduzido = traduzirErroAuth(err);
      setErro(traduzido.mensagem);
      setSugerirNovaAba(Boolean(traduzido.mostrarNovaAba));
    } finally {
      setCarregando(false);
    }
  };

  const handleConfirmarVerificacao = async () => {
    setErro(null);
    setSucesso(null);
    setVerificandoEmail(true);
    try {
      const ok = await recarregarUsuario();
      if (!ok) {
        setErro(
          'E-mail ainda não confirmado. Clique no link enviado para sua caixa de entrada (verifique também o spam).'
        );
      }
    } catch (err) {
      setErro(traduzirErroAuth(err).mensagem);
    } finally {
      setVerificandoEmail(false);
    }
  };

  const handleReenviarVerificacao = async () => {
    setErro(null);
    setSucesso(null);
    setReenviandoEmail(true);
    try {
      await reenviarVerificacao();
      setSucesso('Novo e-mail de verificação enviado. Confira sua caixa de entrada e a pasta de spam.');
    } catch (err) {
      setErro(traduzirErroAuth(err).mensagem);
    } finally {
      setReenviandoEmail(false);
    }
  };

  const urlAtual = typeof window !== 'undefined' ? window.location.href : '/entrar';

  return (
    <div className="min-h-screen bg-[#FAF9FC] flex flex-col">
      <Navbar />

      <main className="flex-1 flex items-center justify-center p-6">
        {authPronto && user && !emailVerificado ? (
          <div className="max-w-md w-full bg-white border border-[#E4DFEC] rounded-2xl p-8 space-y-5">
            <div className="flex items-center gap-3 text-[#2D254E]">
              <MailCheck className="w-6 h-6 text-[#D065D6]" />
              <h1 className="font-display text-2xl font-semibold">Confirme seu e-mail</h1>
            </div>
            <p className="text-sm text-[#728168] leading-relaxed">
              Por segurança, as regras do banco exigem e-mail verificado para gravar dados do ateliê.
              Verifique a caixa de entrada (ou spam) de{' '}
              <strong className="text-[#2D254E]">{user.email}</strong>.
            </p>
            {sucesso && (
              <p className="text-xs bg-[#94D665]/25 border border-[#94D665] text-[#2D254E] px-3 py-2 rounded-lg">
                {sucesso}
              </p>
            )}
            {erro && (
              <p className="text-xs bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg">
                {erro}
              </p>
            )}
            <div className="space-y-2.5">
              <button
                type="button"
                disabled={verificandoEmail || reenviandoEmail}
                onClick={handleConfirmarVerificacao}
                className="w-full py-2.5 px-4 rounded-lg bg-[#2D254E] text-white text-sm font-semibold hover:bg-[#2D254E]/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${verificandoEmail ? 'animate-spin' : ''}`} />
                {verificandoEmail ? 'Verificando confirmação...' : 'Já confirmei meu e-mail'}
              </button>
              <button
                type="button"
                disabled={verificandoEmail || reenviandoEmail}
                onClick={handleReenviarVerificacao}
                className="w-full py-2.5 px-4 rounded-lg border border-[#E4DFEC] text-sm font-medium text-[#2D254E] hover:bg-[#F4F2F7] transition-colors disabled:opacity-50 cursor-pointer"
              >
                {reenviandoEmail ? 'Reenviando...' : 'Reenviar e-mail de verificação'}
              </button>
              <button
                type="button"
                onClick={sair}
                className="w-full py-2 text-xs text-[#728168] hover:text-[#2D254E] cursor-pointer"
              >
                Sair e entrar com outra conta
              </button>
            </div>
          </div>
        ) : (
          <div className="max-w-md w-full bg-white border border-[#E4DFEC] rounded-2xl p-8">
            <div className="mb-6">
              <h1 className="font-display text-2xl font-semibold text-[#2D254E]">
                {modo === 'login' && 'Entrar no ateliê'}
                {modo === 'cadastro' && 'Criar conta de artesão'}
                {modo === 'recuperar' && 'Recuperar senha'}
              </h1>
              <p className="text-sm text-[#728168] mt-1">
                {modo === 'login' && 'Acesse seu painel Kanban, calculadora e vitrine.'}
                {modo === 'cadastro' && 'Comece gratuitamente com até 10 pedidos por mês.'}
                {modo === 'recuperar' && 'Enviaremos um link de redefinição para o seu e-mail.'}
              </p>
            </div>

            {/* Alternador de modo */}
            <div className="grid grid-cols-2 gap-1 p-1 bg-[#F4F2F7] rounded-lg mb-6">
              <button
                type="button"
                onClick={() => {
                  setModo('login');
                  setErro(null);
                  setSucesso(null);
                  setSugerirNovaAba(false);
                }}
                className={`py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  modo === 'login' ? 'bg-white text-[#2D254E] shadow-xs' : 'text-[#728168]'
                }`}
              >
                Entrar
              </button>
              <button
                type="button"
                onClick={() => {
                  setModo('cadastro');
                  setErro(null);
                  setSucesso(null);
                  setSugerirNovaAba(false);
                }}
                className={`py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  modo === 'cadastro' ? 'bg-white text-[#2D254E] shadow-xs' : 'text-[#728168]'
                }`}
              >
                Cadastrar
              </button>
            </div>

            {erro && (
              <div className="mb-4 text-xs bg-red-50 border border-red-200 text-red-700 px-3.5 py-2.5 rounded-lg space-y-2">
                <p>{erro}</p>
                {sugerirNovaAba && (
                  <a
                    href={urlAtual}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 font-semibold text-[#2D254E] underline underline-offset-2"
                  >
                    Abrir página de acesso em nova aba
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            )}
            {sucesso && (
              <div className="mb-4 text-xs bg-[#94D665]/25 border border-[#94D665] text-[#2D254E] px-3.5 py-2.5 rounded-lg">
                {sucesso}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {modo === 'cadastro' && (
                <label className="block">
                  <span className="block text-xs font-medium text-[#728168] mb-1">
                    Seu nome
                  </span>
                  <input
                    type="text"
                    required
                    minLength={2}
                    maxLength={80}
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    placeholder="Ex.: Clara Mendes"
                    className="w-full px-3.5 py-2.5 text-sm bg-[#FAF9FC] border border-[#E4DFEC] rounded-lg text-[#2D254E] focus:outline-none focus:border-[#D065D6]"
                  />
                </label>
              )}

              <label className="block">
                <span className="block text-xs font-medium text-[#728168] mb-1">
                  E-mail
                </span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@atelie.com.br"
                  className="w-full px-3.5 py-2.5 text-sm bg-[#FAF9FC] border border-[#E4DFEC] rounded-lg text-[#2D254E] focus:outline-none focus:border-[#D065D6]"
                />
              </label>

              {modo !== 'recuperar' && (
                <label className="block">
                  <span className="block text-xs font-medium text-[#728168] mb-1">
                    Senha
                  </span>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full px-3.5 py-2.5 text-sm bg-[#FAF9FC] border border-[#E4DFEC] rounded-lg text-[#2D254E] focus:outline-none focus:border-[#D065D6]"
                  />
                </label>
              )}

              {modo === 'login' && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setModo('recuperar');
                      setErro(null);
                      setSucesso(null);
                      setSugerirNovaAba(false);
                    }}
                    className="text-xs font-medium text-[#728168] hover:text-[#2D254E] underline underline-offset-2 transition-colors cursor-pointer"
                  >
                    Recuperar senha
                  </button>
                </div>
              )}

              {modo === 'recuperar' && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setModo('login');
                      setErro(null);
                      setSucesso(null);
                      setSugerirNovaAba(false);
                    }}
                    className="text-xs font-medium text-[#728168] hover:text-[#2D254E] underline underline-offset-2 transition-colors cursor-pointer"
                  >
                    Voltar para o login
                  </button>
                </div>
              )}

              <button
                type="submit"
                disabled={carregando}
                className="w-full py-2.5 px-4 rounded-lg bg-[#2D254E] text-white text-sm font-semibold hover:bg-[#2D254E]/90 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {carregando
                  ? 'Processando...'
                  : modo === 'login'
                    ? 'Entrar com e-mail'
                    : modo === 'cadastro'
                      ? 'Criar conta'
                      : 'Enviar link de recuperação'}
              </button>
            </form>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[#E4DFEC]" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-white px-3 text-[#728168]">ou</span>
              </div>
            </div>

            <button
              type="button"
              disabled={carregando}
              onClick={handleGoogle}
              className="w-full py-2.5 px-4 rounded-lg border border-[#E4DFEC] bg-white text-sm font-medium text-[#2D254E] hover:bg-[#F4F2F7] transition-colors disabled:opacity-50 cursor-pointer"
            >
              Continuar com Google
            </button>

            {emIframe && (
              <p className="text-[11px] text-[#728168] text-center mt-2.5">
                Se o popup do Google for bloqueado nesta janela,{' '}
                <a
                  href={urlAtual}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#2D254E] underline"
                >
                  abra o login em nova aba
                </a>
                .
              </p>
            )}

            <p className="text-xs text-[#728168] text-center mt-6">
              Ao usar a plataforma, você concorda com nossa{' '}
              <Link to="/privacidade" className="text-[#2D254E] underline">
                política de privacidade LGPD
              </Link>
              .
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

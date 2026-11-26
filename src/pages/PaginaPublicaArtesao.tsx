import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { CheckCircle2, ImagePlus, Lock, Trash2, X } from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { useAuth } from '../hooks/useAuth';
import { db, OperationType, registrarErroFirestore } from '../lib/firebase';
import { comprimirImagemNoNavegador, formatarTamanhoBytes } from '../lib/imagens';
import {
  MAX_IMAGENS_POR_PEDIDO,
  formatarMoedaBrl,
  obterMesReferenciaBahia,
  validarConsentimentoLgpd,
  validarListaImagensPedido,
  validarSlug,
  type ImagemAnexadaPayload,
} from '../lib/regras';
import type { ItemPortfolioDoc, PerfilPublicoDoc } from '../lib/tipos';
import vasePortfolioImg from '../assets/images/portfolio_ceramic_vase_1795566420798.jpg';
import leatherPortfolioImg from '../assets/images/portfolio_leather_bag_1795566421523.jpg';
import embroideryPortfolioImg from '../assets/images/portfolio_botanical_embroidery_1795566422452.jpg';

type PerfilPublicoView = Omit<PerfilPublicoDoc, 'criadoEm' | 'atualizadoEm'>;
type ItemPortfolioView = Omit<ItemPortfolioDoc, 'criadoEm' | 'atualizadoEm'>;

const PERFIL_EXEMPLO: PerfilPublicoView = {
  uid: 'exemplo-atelie',
  slug: 'exemplo-atelie',
  nomeAtelie: 'Ateliê Barro & Linha',
  especialidade: 'Cerâmica autoral, couro e bordado botânico',
  cidadeUf: 'Salvador, BA',
  bio: 'Produzimos peças únicas em pequenas fornadas e costura manual sob medida. Cada encomenda começa com conversa sobre medidas, paleta de esmaltes e prazo de secagem natural.',
  prazoMedioDias: 15,
  aceitandoPedidos: true,
  ativo: true,
  corDestaque: '#2D254E',
  categorias: ['Cerâmica autoral', 'Couro & selaria', 'Bordado livre', 'Presentes sob medida'],
};

const PORTFOLIO_EXEMPLO: ItemPortfolioView[] = [
  {
    id: 'ex-1',
    uid: 'exemplo-atelie',
    titulo: 'Vaso em grés esmaltado',
    categoria: 'Cerâmica autoral',
    descricao: 'Queima de alta temperatura com esmalte mineral em tons de ameixa e sálvia.',
    tempoProducaoDias: 14,
    precoReferencia: 340,
    imagemBase64: vasePortfolioImg,
    ordem: 0,
  },
  {
    id: 'ex-2',
    uid: 'exemplo-atelie',
    titulo: 'Bolsa tiracolo em couro legítimo',
    categoria: 'Couro & selaria',
    descricao: 'Costura manual encerada e fivelas em latão maciço.',
    tempoProducaoDias: 18,
    precoReferencia: 680,
    imagemBase64: leatherPortfolioImg,
    ordem: 1,
  },
  {
    id: 'ex-3',
    uid: 'exemplo-atelie',
    titulo: 'Bastidor botânico em linho',
    categoria: 'Bordado livre',
    descricao: 'Composição floral bordada à mão com fios de algodão e linho.',
    tempoProducaoDias: 10,
    precoReferencia: 260,
    imagemBase64: embroideryPortfolioImg,
    ordem: 2,
  },
];

export function PaginaPublicaArtesao() {
  const { slug = '' } = useParams<{ slug: string }>();
  const { authPronto } = useAuth();

  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [ehExemplo, setEhExemplo] = useState(false);
  const [perfil, setPerfil] = useState<PerfilPublicoView | null>(null);
  const [portfolio, setPortfolio] = useState<ItemPortfolioView[]>([]);
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>('todas');
  const [itemLightbox, setItemLightbox] = useState<ItemPortfolioView | null>(null);

  // Formulário de pedido sem conta
  const [clienteNome, setClienteNome] = useState('');
  const [clienteEmail, setClienteEmail] = useState('');
  const [clienteWhatsApp, setClienteWhatsApp] = useState('');
  const [categoria, setCategoria] = useState('');
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [medidas, setMedidas] = useState('');
  const [orcamentoClienteDesejado, setOrcamentoClienteDesejado] = useState('');
  const [prazoDesejadoTexto, setPrazoDesejadoTexto] = useState('');
  const [consentimentoLgpd, setConsentimentoLgpd] = useState(false);
  const [imagens, setImagens] = useState<ImagemAnexadaPayload[]>([]);
  const [comprimindo, setComprimindo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [errosCampos, setErrosCampos] = useState<Record<string, string>>({});
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const [pedidoCriadoCodigo, setPedidoCriadoCodigo] = useState<string | null>(null);

  useEffect(() => {
    if (!authPronto) return;

    let ativo = true;
    const slugLimpo = slug.trim().toLowerCase();

    const aplicarExemplo = () => {
      if (!ativo) return;
      setPerfil(PERFIL_EXEMPLO);
      setPortfolio(PORTFOLIO_EXEMPLO);
      setCategoria(PERFIL_EXEMPLO.categorias[0]);
      setEhExemplo(true);
    };

    const carregar = async () => {
      setCarregando(true);
      setErroCarga(null);
      setEhExemplo(false);
      setPedidoCriadoCodigo(null);

      const checkSlug = validarSlug(slugLimpo);
      if (!checkSlug.valido) {
        if (ativo) {
          setErroCarga(checkSlug.erro || 'Endereço de ateliê inválido.');
          setPerfil(null);
          setCarregando(false);
        }
        return;
      }

      try {
        const slugSnap = await getDoc(doc(db, 'slugs', slugLimpo));
        if (!slugSnap.exists()) {
          if (slugLimpo === 'exemplo-atelie') {
            aplicarExemplo();
          } else if (ativo) {
            setErroCarga('Ateliê não encontrado.');
            setPerfil(null);
          }
          return;
        }

        const uid = String(slugSnap.data()?.uid || '');
        if (!uid || !/^[a-zA-Z0-9_-]+$/.test(uid)) {
          if (ativo) {
            setErroCarga('Ateliê não encontrado.');
            setPerfil(null);
          }
          return;
        }

        let perfilSnap;
        try {
          perfilSnap = await getDoc(doc(db, 'perfisPublicos', uid));
        } catch (err) {
          const info = registrarErroFirestore(err, OperationType.GET, `perfisPublicos/${uid}`);
          if (
            info.error.includes('permission-denied') ||
            info.error.includes('Missing or insufficient permissions')
          ) {
            if (ativo) {
              setErroCarga('Esta página pública está temporariamente pausada pelo ateliê.');
              setPerfil(null);
            }
            return;
          }
          throw err;
        }

        if (!perfilSnap.exists()) {
          if (slugLimpo === 'exemplo-atelie') {
            aplicarExemplo();
          } else if (ativo) {
            setErroCarga('Perfil público não encontrado.');
            setPerfil(null);
          }
          return;
        }

        const p = perfilSnap.data() as PerfilPublicoDoc;
        const perfilCarregado: PerfilPublicoView = {
          uid: p.uid,
          slug: p.slug,
          nomeAtelie: p.nomeAtelie,
          especialidade: p.especialidade,
          cidadeUf: p.cidadeUf || '',
          bio: p.bio || '',
          prazoMedioDias: p.prazoMedioDias,
          aceitandoPedidos: Boolean(p.aceitandoPedidos),
          ativo: Boolean(p.ativo),
          corDestaque: p.corDestaque || '#2D254E',
          categorias: Array.isArray(p.categorias) ? p.categorias : [],
        };

        const portfolioSnap = await getDocs(
          query(collection(db, 'perfisPublicos', uid, 'portfolio'), where('uid', '==', uid))
        );
        const itensPortfolio: ItemPortfolioView[] = portfolioSnap.docs
          .map((docSnap) => {
            const item = docSnap.data() as Omit<ItemPortfolioDoc, 'id'>;
            return {
              id: docSnap.id,
              uid: item.uid,
              titulo: item.titulo,
              categoria: item.categoria,
              descricao: item.descricao || '',
              tempoProducaoDias: item.tempoProducaoDias,
              precoReferencia: item.precoReferencia,
              imagemBase64: item.imagemBase64,
              ordem: item.ordem ?? 0,
            };
          })
          .sort((a, b) => a.ordem - b.ordem);

        if (ativo) {
          setPerfil(perfilCarregado);
          setPortfolio(itensPortfolio);
          setCategoria(
            perfilCarregado.categorias?.[0] || perfilCarregado.especialidade || 'Sob medida'
          );
        }
      } catch (err) {
        registrarErroFirestore(err, OperationType.GET, `slugs/${slugLimpo}`);
        if (slugLimpo === 'exemplo-atelie') {
          aplicarExemplo();
        } else if (ativo) {
          setErroCarga('Não foi possível carregar os dados deste ateliê.');
          setPerfil(null);
        }
      } finally {
        if (ativo) setCarregando(false);
      }
    };

    void carregar();
    return () => {
      ativo = false;
    };
  }, [slug, authPronto]);

  const handleSelecionarImagens = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;

    const espacoRestante = MAX_IMAGENS_POR_PEDIDO - imagens.length;
    if (espacoRestante <= 0) {
      setErroEnvio(`Limite máximo de ${MAX_IMAGENS_POR_PEDIDO} imagens por pedido.`);
      return;
    }

    setComprimindo(true);
    setErroEnvio(null);
    try {
      const selecionados = files.slice(0, espacoRestante);
      const comprimidos: ImagemAnexadaPayload[] = [];
      for (const file of selecionados) {
        const comprimida = await comprimirImagemNoNavegador(file, 1280, 0.7);
        comprimidos.push(comprimida);
      }
      setImagens((prev) => [...prev, ...comprimidos]);
    } catch (err) {
      setErroEnvio(err instanceof Error ? err.message : 'Erro ao processar imagem.');
    } finally {
      setComprimindo(false);
    }
  };

  const removerImagem = (index: number) => {
    setImagens((prev) => prev.filter((_, i) => i !== index));
  };

  const handleEnviarPedido = async (e: FormEvent) => {
    e.preventDefault();
    if (!perfil) return;
    setErrosCampos({});
    setErroEnvio(null);

    if (ehExemplo) {
      setErroEnvio(
        'Esta é uma vitrine demonstrativa. Crie sua conta para gerar sua página pública real e receber pedidos no Firestore.'
      );
      return;
    }

    const clienteNomeLimpo = clienteNome.trim().slice(0, 100);
    const clienteEmailLimpo = clienteEmail.trim().slice(0, 120).toLowerCase();
    const clienteWhatsAppLimpo = clienteWhatsApp.trim().slice(0, 30);
    const categoriaLimpa = categoria.trim().slice(0, 60);
    const tituloLimpo = titulo.trim().slice(0, 120);
    const descricaoLimpa = descricao.trim().slice(0, 2000);
    const medidasLimpas = medidas.trim().slice(0, 200);
    const prazoDesejadoLimpo = prazoDesejadoTexto.trim().slice(0, 80);

    let orcamentoNum: number | null = null;
    if (orcamentoClienteDesejado.trim() !== '') {
      const parsed = Number(orcamentoClienteDesejado);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1000000) {
        setErrosCampos({ orcamentoClienteDesejado: 'Informe um valor positivo válido.' });
        setErroEnvio('Verifique os campos antes de enviar.');
        return;
      }
      orcamentoNum = Math.round(parsed * 100) / 100;
    }

    const camposInvalidos: Record<string, string> = {};
    if (clienteNomeLimpo.length < 2) {
      camposInvalidos.clienteNome = 'Informe seu nome completo (mínimo 2 caracteres).';
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clienteEmailLimpo) || clienteEmailLimpo.length > 120) {
      camposInvalidos.clienteEmail = 'Informe um e-mail válido para contato.';
    }
    if (categoriaLimpa.length < 2) {
      camposInvalidos.categoria = 'Selecione ou informe a categoria da peça.';
    }
    if (tituloLimpo.length < 3) {
      camposInvalidos.titulo = 'Informe um título breve para a encomenda.';
    }
    if (descricaoLimpa.length < 10) {
      camposInvalidos.descricao = 'Descreva os detalhes da encomenda (mínimo 10 caracteres).';
    }
    if (!validarConsentimentoLgpd(consentimentoLgpd)) {
      camposInvalidos.consentimentoLgpd = 'É obrigatório concordar com o uso dos dados (LGPD).';
    }

    const validacaoImagens = validarListaImagensPedido(imagens);
    if (!validacaoImagens.valido) {
      camposInvalidos.imagens = validacaoImagens.erro || 'Imagens inválidas.';
    }

    if (Object.keys(camposInvalidos).length > 0) {
      setErrosCampos(camposInvalidos);
      setErroEnvio(camposInvalidos.imagens || 'Verifique os campos obrigatórios antes de enviar.');
      return;
    }

    setEnviando(true);
    try {
      const perfilAtualSnap = await getDoc(doc(db, 'perfisPublicos', perfil.uid));
      if (!perfilAtualSnap.exists()) {
        setErroEnvio('Ateliê não encontrado.');
        return;
      }
      const perfilAtual = perfilAtualSnap.data() as PerfilPublicoDoc;
      if (perfilAtual.ativo === false) {
        setErroEnvio('Este ateliê está com a página pública pausada no momento.');
        return;
      }
      if (perfilAtual.aceitandoPedidos === false) {
        setPerfil((prev) => (prev ? { ...prev, aceitandoPedidos: false } : prev));
        setErroEnvio('Este ateliê atingiu o limite mensal de pedidos no momento.');
        return;
      }

      const mesRef = obterMesReferenciaBahia().replace('-', '');
      const sufixoCodigo = Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, '0');
      const codigoPedido = `PED-${mesRef}-${sufixoCodigo}`;

      const pedidoRef = doc(collection(db, 'artesaos', perfil.uid, 'pedidos'));
      const historicoRef = doc(collection(db, 'artesaos', perfil.uid, 'pedidos', pedidoRef.id, 'historico'));
      const batch = writeBatch(db);

      batch.set(pedidoRef, {
        uidArtesao: perfil.uid,
        codigo: codigoPedido,
        clienteNome: clienteNomeLimpo,
        clienteEmail: clienteEmailLimpo,
        clienteWhatsApp: clienteWhatsAppLimpo,
        categoria: categoriaLimpa,
        titulo: tituloLimpo,
        descricao: descricaoLimpa,
        medidas: medidasLimpas,
        orcamentoClienteDesejado: orcamentoNum,
        prazoDesejadoTexto: prazoDesejadoLimpo,
        status: 'Novo',
        consentimentoLgpd: true,
        consentimentoEm: serverTimestamp(),
        consentimentoVersao: '1.0',
        prazoEstimadoDias: null,
        dataEntregaPrevista: null,
        notasInternas: '',
        orcamentoAtual: null,
        totalImagens: validacaoImagens.itens.length,
        criadoEm: serverTimestamp(),
        atualizadoEm: serverTimestamp(),
        encerradoEm: null,
      });

      batch.set(historicoRef, {
        tipo: 'criacao',
        descricao: 'Pedido enviado pelo cliente com consentimento LGPD (versão 1.0).',
        autor: 'cliente',
        criadoEm: serverTimestamp(),
      });

      for (const img of validacaoImagens.itens) {
        const imgRef = doc(collection(db, 'artesaos', perfil.uid, 'pedidos', pedidoRef.id, 'imagens'));
        batch.set(imgRef, {
          nome: img.nome,
          mimeType: img.mimeType,
          tamanhoBytes: img.tamanhoBytes,
          dataBase64: img.dataBase64,
          criadoEm: serverTimestamp(),
        });
      }

      await batch.commit();

      setPedidoCriadoCodigo(codigoPedido);
      setClienteNome('');
      setClienteEmail('');
      setClienteWhatsApp('');
      setTitulo('');
      setDescricao('');
      setMedidas('');
      setOrcamentoClienteDesejado('');
      setPrazoDesejadoTexto('');
      setConsentimentoLgpd(false);
      setImagens([]);
    } catch (err) {
      const info = registrarErroFirestore(err, OperationType.CREATE, `artesaos/${perfil.uid}/pedidos`);
      if (
        info.error.includes('permission-denied') ||
        info.error.includes('Missing or insufficient permissions')
      ) {
        setErroEnvio(
          'Não foi possível registrar o pedido: verifique se todos os campos obrigatórios e o consentimento LGPD estão preenchidos.'
        );
      } else if (info.error.includes('offline') || info.error.includes('unavailable')) {
        setErroEnvio('Sem conexão com o banco de dados no momento. Tente novamente em instantes.');
      } else {
        setErroEnvio('Não foi possível registrar o pedido agora. Tente novamente em instantes.');
      }
    } finally {
      setEnviando(false);
    }
  };

  const categoriasDisponiveis = Array.from(
    new Set(portfolio.map((item) => item.categoria).filter(Boolean))
  );
  const portfolioFiltrado =
    categoriaFiltro === 'todas'
      ? portfolio
      : portfolio.filter((item) => item.categoria === categoriaFiltro);

  return (
    <div className="min-h-screen bg-[#FAF9FC] text-[#2D254E]">
      <Navbar />

      {carregando ? (
        <main className="max-w-6xl mx-auto px-6 py-16">
          <div className="h-48 bg-white border border-[#E4DFEC] rounded-2xl animate-pulse" />
        </main>
      ) : erroCarga || !perfil ? (
        <main className="max-w-2xl mx-auto px-6 py-20 text-center space-y-4">
          <h1 className="font-display text-3xl font-semibold text-[#2D254E]">
            Ateliê não encontrado
          </h1>
          <p className="text-sm text-[#728168]">
            {erroCarga || 'Verifique o endereço digitado e tente novamente.'}
          </p>
          <Link
            to="/"
            className="inline-block px-5 py-2.5 rounded-lg bg-[#2D254E] text-white text-sm font-medium"
          >
            Voltar ao início
          </Link>
        </main>
      ) : (
        <main className="max-w-6xl mx-auto px-6 py-10 space-y-12">
          {ehExemplo && (
            <div className="bg-[#2D254E] text-white rounded-xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-4 text-sm">
              <span>
                Vitrine demonstrativa: explore como seus clientes visualizam seu portfólio e o formulário LGPD.
              </span>
              <Link
                to="/entrar"
                className="px-3.5 py-1.5 rounded-lg bg-[#94D665] text-[#2D254E] font-semibold text-xs whitespace-nowrap"
              >
                Criar minha vitrine real
              </Link>
            </div>
          )}

          {!ehExemplo && !perfil.ativo && (
            <div className="bg-[#F4F2F7] border border-[#E4DFEC] text-[#2D254E] rounded-xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-4 text-sm">
              <span>
                Pré-visualização do proprietário: esta página pública está oculta para visitantes no momento.
              </span>
              <Link
                to="/painel"
                className="px-3.5 py-1.5 rounded-lg bg-[#2D254E] text-white font-semibold text-xs whitespace-nowrap"
              >
                Voltar ao painel
              </Link>
            </div>
          )}

          {/* Cabeçalho público do artesão (sem PII) */}
          <section className="bg-white border border-[#E4DFEC] rounded-2xl p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-3 max-w-2xl">
              <div className="flex flex-wrap items-center gap-2 text-xs text-[#728168]">
                <span>{perfil.especialidade}</span>
                {perfil.cidadeUf && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{perfil.cidadeUf}</span>
                  </>
                )}
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  Prazo médio de {perfil.prazoMedioDias} dias
                </span>
              </div>
              <h1 className="font-display text-3xl sm:text-4xl font-semibold text-[#2D254E]">
                {perfil.nomeAtelie}
              </h1>
              {perfil.bio && (
                <p className="text-sm sm:text-base text-[#728168] leading-relaxed">
                  {perfil.bio}
                </p>
              )}
            </div>

            <div className="shrink-0 flex flex-col items-start lg:items-end gap-3">
              <div
                className={`px-4 py-2 rounded-lg text-xs font-semibold border ${
                  perfil.aceitandoPedidos
                    ? 'bg-[#94D665]/25 border-[#94D665] text-[#2D254E]'
                    : 'bg-[#F4F2F7] border-[#E4DFEC] text-[#728168]'
                }`}
              >
                {perfil.aceitandoPedidos
                  ? 'Agenda aberta para novas encomendas'
                  : 'Agenda fechada no momento (cota mensal atingida)'}
              </div>
              {perfil.aceitandoPedidos && (
                <a
                  href="#solicitar-pedido"
                  className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-colors"
                  style={{ backgroundColor: perfil.corDestaque || '#2D254E' }}
                >
                  Solicitar orçamento sob medida
                </a>
              )}
            </div>
          </section>

          {/* Portfólio */}
          <section className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 className="font-display text-2xl font-semibold text-[#2D254E]">
                Portfólio de peças
              </h2>
              {categoriasDisponiveis.length > 1 && (
                <div className="flex items-center gap-1 p-1 bg-[#F4F2F7] rounded-lg overflow-x-auto">
                  <button
                    type="button"
                    onClick={() => setCategoriaFiltro('todas')}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap cursor-pointer ${
                      categoriaFiltro === 'todas'
                        ? 'bg-white text-[#2D254E] shadow-xs'
                        : 'text-[#728168]'
                    }`}
                  >
                    Todas
                  </button>
                  {categoriasDisponiveis.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategoriaFiltro(cat)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap cursor-pointer ${
                        categoriaFiltro === cat
                          ? 'bg-white text-[#2D254E] shadow-xs'
                          : 'text-[#728168]'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {portfolioFiltrado.length === 0 ? (
              <div className="bg-white border border-[#E4DFEC] rounded-2xl p-10 text-center text-sm text-[#728168]">
                Este ateliê ainda não publicou fotos no portfólio, mas você pode descrever sua ideia no formulário abaixo.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {portfolioFiltrado.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setItemLightbox(item)}
                    className="group bg-white border border-[#E4DFEC] rounded-2xl overflow-hidden text-left hover:border-[#D065D6] transition-colors cursor-pointer"
                  >
                    <div className="aspect-4/3 bg-[#F4F2F7] overflow-hidden">
                      <img
                        src={item.imagemBase64}
                        alt={item.titulo}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-200"
                      />
                    </div>
                    <div className="p-5 space-y-1.5">
                      <div className="flex items-center gap-2 text-xs text-[#728168]">
                        <span>{item.categoria}</span>
                        <span aria-hidden="true">·</span>
                        <span>{item.tempoProducaoDias} dias</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums text-[#2D254E] font-medium">
                          {formatarMoedaBrl(item.precoReferencia)}
                        </span>
                      </div>
                      <h3 className="font-display text-lg font-semibold text-[#2D254E]">
                        {item.titulo}
                      </h3>
                      {item.descricao && (
                        <p className="text-xs text-[#728168] line-clamp-2">{item.descricao}</p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Formulário público de pedido sem conta */}
          <section id="solicitar-pedido" className="bg-white border border-[#E4DFEC] rounded-2xl p-6 sm:p-8">
            <div className="max-w-2xl mb-6">
              <h2 className="font-display text-2xl font-semibold text-[#2D254E] mb-1">
                Solicitar encomenda sob medida
              </h2>
              <p className="text-sm text-[#728168]">
                Não é necessário criar conta. Descreva sua peça e envie até 5 imagens de referência.
              </p>
            </div>

            {!perfil.aceitandoPedidos ? (
              <div className="bg-[#F4F2F7] border border-[#E4DFEC] rounded-xl p-6 flex items-start gap-3">
                <Lock className="w-5 h-5 text-[#728168] shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-[#2D254E]">
                    Pedidos temporariamente pausados
                  </p>
                  <p className="text-xs text-[#728168] mt-1">
                    Este ateliê atingiu o limite mensal de encomendas no momento (RN06). Tente novamente na virada do mês.
                  </p>
                </div>
              </div>
            ) : pedidoCriadoCodigo ? (
              <div className="bg-[#94D665]/20 border border-[#94D665] rounded-xl p-6 space-y-3">
                <div className="flex items-center gap-2.5 text-[#2D254E]">
                  <CheckCircle2 className="w-5 h-5" />
                  <h3 className="font-display text-lg font-semibold">
                    Pedido enviado com sucesso
                  </h3>
                </div>
                <p className="text-sm text-[#2D254E]/85">
                  Código de acompanhamento:{' '}
                  <strong className="font-mono">{pedidoCriadoCodigo}</strong>. O ateliê recebeu sua
                  solicitação e entrará em contato pelo e-mail informado com o orçamento.
                </p>
                <button
                  type="button"
                  onClick={() => setPedidoCriadoCodigo(null)}
                  className="px-4 py-2 rounded-lg bg-[#2D254E] text-white text-xs font-medium cursor-pointer"
                >
                  Enviar outra solicitação
                </button>
              </div>
            ) : (
              <form onSubmit={handleEnviarPedido} className="space-y-5">
                {erroEnvio && (
                  <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
                    {erroEnvio}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <label className="block">
                    <span className="block text-xs font-medium text-[#728168] mb-1">
                      Seu nome completo *
                    </span>
                    <input
                      type="text"
                      required
                      minLength={2}
                      maxLength={100}
                      value={clienteNome}
                      onChange={(e) => setClienteNome(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm bg-[#FAF9FC] border border-[#E4DFEC] rounded-lg focus:outline-none focus:border-[#D065D6]"
                    />
                    {errosCampos.clienteNome && (
                      <span className="text-xs text-red-600 mt-1 block">{errosCampos.clienteNome}</span>
                    )}
                  </label>

                  <label className="block">
                    <span className="block text-xs font-medium text-[#728168] mb-1">
                      Seu e-mail *
                    </span>
                    <input
                      type="email"
                      required
                      maxLength={120}
                      value={clienteEmail}
                      onChange={(e) => setClienteEmail(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm bg-[#FAF9FC] border border-[#E4DFEC] rounded-lg focus:outline-none focus:border-[#D065D6]"
                    />
                    {errosCampos.clienteEmail && (
                      <span className="text-xs text-red-600 mt-1 block">{errosCampos.clienteEmail}</span>
                    )}
                  </label>

                  <label className="block">
                    <span className="block text-xs font-medium text-[#728168] mb-1">
                      WhatsApp (opcional)
                    </span>
                    <input
                      type="tel"
                      maxLength={30}
                      value={clienteWhatsApp}
                      onChange={(e) => setClienteWhatsApp(e.target.value)}
                      placeholder="(71) 99999-0000"
                      className="w-full px-3.5 py-2.5 text-sm bg-[#FAF9FC] border border-[#E4DFEC] rounded-lg focus:outline-none focus:border-[#D065D6]"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="block">
                    <span className="block text-xs font-medium text-[#728168] mb-1">
                      Título da peça *
                    </span>
                    <input
                      type="text"
                      required
                      minLength={3}
                      maxLength={120}
                      value={titulo}
                      onChange={(e) => setTitulo(e.target.value)}
                      placeholder="Ex.: Jogo de 4 xícaras esmaltadas em tom sálvia"
                      className="w-full px-3.5 py-2.5 text-sm bg-[#FAF9FC] border border-[#E4DFEC] rounded-lg focus:outline-none focus:border-[#D065D6]"
                    />
                    {errosCampos.titulo && (
                      <span className="text-xs text-red-600 mt-1 block">{errosCampos.titulo}</span>
                    )}
                  </label>

                  <label className="block">
                    <span className="block text-xs font-medium text-[#728168] mb-1">
                      Categoria *
                    </span>
                    <input
                      type="text"
                      required
                      minLength={2}
                      maxLength={60}
                      value={categoria}
                      onChange={(e) => setCategoria(e.target.value)}
                      list="categorias-perfil"
                      className="w-full px-3.5 py-2.5 text-sm bg-[#FAF9FC] border border-[#E4DFEC] rounded-lg focus:outline-none focus:border-[#D065D6]"
                    />
                    <datalist id="categorias-perfil">
                      {(perfil.categorias || []).map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                  </label>
                </div>

                <label className="block">
                  <span className="block text-xs font-medium text-[#728168] mb-1">
                    Descrição detalhada do pedido *
                  </span>
                  <textarea
                    required
                    minLength={10}
                    maxLength={2000}
                    rows={4}
                    value={descricao}
                    onChange={(e) => setDescricao(e.target.value)}
                    placeholder="Conte sobre cores, materiais, uso pretendido e detalhes importantes..."
                    className="w-full px-3.5 py-2.5 text-sm bg-[#FAF9FC] border border-[#E4DFEC] rounded-lg focus:outline-none focus:border-[#D065D6]"
                  />
                  {errosCampos.descricao && (
                    <span className="text-xs text-red-600 mt-1 block">{errosCampos.descricao}</span>
                  )}
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <label className="relative block">
                    <span className="block text-xs font-medium text-[#728168] mb-1">
                      Medidas aproximadas (cm)
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      maxLength={200}
                      value={medidas}
                      onChange={(e) => setMedidas(e.target.value)}
                      placeholder="22 x 14"
                      className="w-full pl-3.5 pr-11 py-2.5 text-sm font-mono tabular-nums bg-[#FAF9FC] border border-[#E4DFEC] rounded-lg text-[#2D254E] focus:outline-none focus:border-[#D065D6]"
                    />
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute right-3.5 bottom-0 h-[42px] flex items-center text-xs font-mono font-medium text-[#728168]"
                    >
                      cm
                    </span>
                  </label>

                  <label className="relative block">
                    <span className="block text-xs font-medium text-[#728168] mb-1">
                      Expectativa de valor (R$)
                    </span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={orcamentoClienteDesejado}
                      onChange={(e) => setOrcamentoClienteDesejado(e.target.value)}
                      placeholder="0,00"
                      className="w-full pl-10 pr-3.5 py-2.5 text-sm font-mono tabular-nums bg-[#FAF9FC] border border-[#E4DFEC] rounded-lg text-[#2D254E] focus:outline-none focus:border-[#D065D6]"
                    />
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute left-3.5 bottom-0 h-[42px] flex items-center text-xs font-mono font-medium text-[#728168]"
                    >
                      R$
                    </span>
                  </label>

                  <label className="block">
                    <span className="block text-xs font-medium text-[#728168] mb-1">
                      Prazo desejado (data)
                    </span>
                    <input
                      type="date"
                      min={new Date().toISOString().split('T')[0]}
                      maxLength={80}
                      value={prazoDesejadoTexto}
                      onChange={(e) => setPrazoDesejadoTexto(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums bg-[#FAF9FC] border border-[#E4DFEC] rounded-lg text-[#2D254E] focus:outline-none focus:border-[#D065D6]"
                    />
                  </label>
                </div>

                {/* Upload e pré-visualização de imagens comprimidas */}
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="block text-xs font-medium text-[#2D254E]">
                        Imagens de referência ({imagens.length}/{MAX_IMAGENS_POR_PEDIDO})
                      </span>
                      <span className="text-xs text-[#728168]">
                        JPG, PNG ou WEBP — comprimidas automaticamente no navegador (máx. 1280px).
                      </span>
                    </div>
                    {imagens.length < MAX_IMAGENS_POR_PEDIDO && (
                      <label className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-[#E4DFEC] bg-[#FAF9FC] text-xs font-medium text-[#2D254E] hover:bg-[#F4F2F7] cursor-pointer">
                        <ImagePlus className="w-4 h-4" />
                        {comprimindo ? 'Comprimindo...' : 'Adicionar fotos'}
                        <input
                          type="file"
                          multiple
                          accept="image/jpeg,image/png,image/webp"
                          disabled={comprimindo}
                          onChange={handleSelecionarImagens}
                          className="sr-only"
                        />
                      </label>
                    )}
                  </div>

                  {imagens.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                      {imagens.map((img, idx) => (
                        <div
                          key={`${img.nome}-${idx}`}
                          className="relative border border-[#E4DFEC] rounded-xl overflow-hidden bg-[#FAF9FC]"
                        >
                          <img
                            src={img.dataBase64}
                            alt={img.nome}
                            referrerPolicy="no-referrer"
                            className="w-full aspect-square object-cover"
                          />
                          <div className="px-2 py-1 text-[11px] text-[#728168] flex items-center justify-between gap-1 bg-white border-t border-[#E4DFEC]">
                            <span className="truncate font-mono">{formatarTamanhoBytes(img.tamanhoBytes)}</span>
                            <button
                              type="button"
                              onClick={() => removerImagem(idx)}
                              aria-label={`Remover ${img.nome}`}
                              className="text-[#2D254E] hover:text-red-600 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Consentimento LGPD obrigatório (RN03) */}
                <label className="flex items-start gap-3 p-4 rounded-xl bg-[#FAF9FC] border border-[#E4DFEC] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={consentimentoLgpd}
                    onChange={(e) => setConsentimentoLgpd(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-[#2D254E]"
                  />
                  <span className="text-xs text-[#2D254E]/85 leading-relaxed">
                    Concordo que meus dados de contato e referências enviadas sejam usados
                    exclusivamente para orçamento e produção deste pedido, com retenção máxima de 12
                    meses após o encerramento (LGPD).{' '}
                    <Link to="/privacidade" className="underline font-medium text-[#2D254E]">
                      Ler política completa
                    </Link>
                    .
                  </span>
                </label>
                {errosCampos.consentimentoLgpd && (
                  <p className="text-xs text-red-600">{errosCampos.consentimentoLgpd}</p>
                )}

                <button
                  type="submit"
                  disabled={enviando || comprimindo}
                  className="px-6 py-3 rounded-lg bg-[#2D254E] text-white text-sm font-semibold hover:bg-[#2D254E]/90 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {enviando ? 'Enviando solicitação...' : 'Enviar pedido ao ateliê'}
                </button>
              </form>
            )}
          </section>
        </main>
      )}

      {/* Lightbox do portfólio */}
      {itemLightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setItemLightbox(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-2xl w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative bg-[#F4F2F7]">
              <img
                src={itemLightbox.imagemBase64}
                alt={itemLightbox.titulo}
                referrerPolicy="no-referrer"
                className="w-full max-h-[60vh] object-contain"
              />
              <button
                type="button"
                onClick={() => setItemLightbox(null)}
                aria-label="Fechar visualização"
                className="absolute top-3 right-3 p-2 rounded-full bg-white/90 text-[#2D254E] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-2">
              <div className="flex items-center gap-2 text-xs text-[#728168]">
                <span>{itemLightbox.categoria}</span>
                <span aria-hidden="true">·</span>
                <span>{itemLightbox.tempoProducaoDias} dias</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums text-[#2D254E] font-semibold">
                  {formatarMoedaBrl(itemLightbox.precoReferencia)}
                </span>
              </div>
              <h3 className="font-display text-xl font-semibold text-[#2D254E]">
                {itemLightbox.titulo}
              </h3>
              {itemLightbox.descricao && (
                <p className="text-sm text-[#728168]">{itemLightbox.descricao}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

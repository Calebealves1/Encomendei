import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onIdTokenChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import type { ArtesaoDoc, PerfilPublicoDoc } from '../lib/tipos';

interface AuthContextValue {
  user: User | null;
  emailVerificado: boolean;
  authPronto: boolean;
  carregandoDados: boolean;
  artesao: ArtesaoDoc | null;
  perfilPublico: PerfilPublicoDoc | null;
  entrarComEmail: (email: string, senha: string) => Promise<void>;
  cadastrarComEmail: (nome: string, email: string, senha: string) => Promise<void>;
  entrarComGoogle: () => Promise<void>;
  enviarRecuperacaoSenha: (email: string) => Promise<void>;
  reenviarVerificacao: () => Promise<void>;
  recarregarUsuario: () => Promise<boolean>;
  sair: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [emailVerificado, setEmailVerificado] = useState(false);
  const [authPronto, setAuthPronto] = useState(false);
  const [, setAuthVersao] = useState(0);
  const [artesao, setArtesao] = useState<ArtesaoDoc | null>(null);
  const [perfilPublico, setPerfilPublico] = useState<PerfilPublicoDoc | null>(null);
  const [carregandoDados, setCarregandoDados] = useState(false);

  useEffect(() => {
    const unsub = onIdTokenChanged(auth, (currentUser) => {
      setUser(currentUser);
      setEmailVerificado(Boolean(currentUser?.emailVerified));
      setAuthPronto(true);
      setAuthVersao((v) => v + 1);
      if (!currentUser) {
        setArtesao(null);
        setPerfilPublico(null);
        setCarregandoDados(false);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!authPronto || !user || !emailVerificado) {
      if (!user || !emailVerificado) {
        setArtesao(null);
        setPerfilPublico(null);
        setCarregandoDados(false);
      }
      return;
    }

    setCarregandoDados(true);

    const artesaoPath = `artesaos/${user.uid}`;
    const perfilPath = `perfisPublicos/${user.uid}`;
    let loadedArtesao = false;
    let loadedPerfil = false;

    const finalizarSePronto = () => {
      if (loadedArtesao && loadedPerfil) {
        setCarregandoDados(false);
      }
    };

    const unsubArtesao = onSnapshot(
      doc(db, 'artesaos', user.uid),
      (snap) => {
        setArtesao(snap.exists() ? (snap.data() as ArtesaoDoc) : null);
        loadedArtesao = true;
        finalizarSePronto();
      },
      (error) => {
        loadedArtesao = true;
        finalizarSePronto();
        handleFirestoreError(error, OperationType.GET, artesaoPath);
      }
    );

    const unsubPerfil = onSnapshot(
      doc(db, 'perfisPublicos', user.uid),
      (snap) => {
        setPerfilPublico(snap.exists() ? (snap.data() as PerfilPublicoDoc) : null);
        loadedPerfil = true;
        finalizarSePronto();
      },
      (error) => {
        loadedPerfil = true;
        finalizarSePronto();
        handleFirestoreError(error, OperationType.GET, perfilPath);
      }
    );

    return () => {
      unsubArtesao();
      unsubPerfil();
    };
  }, [authPronto, user, emailVerificado]);

  const entrarComEmail = useCallback(async (email: string, senha: string) => {
    const cred = await signInWithEmailAndPassword(auth, email.trim(), senha);
    setEmailVerificado(Boolean(cred.user.emailVerified));
    if (cred.user.emailVerified) {
      await cred.user.getIdToken(true);
    }
    setAuthVersao((v) => v + 1);
  }, []);

  const cadastrarComEmail = useCallback(async (nome: string, email: string, senha: string) => {
    const nomeLimpo = nome.trim();
    const emailLimpo = email.trim();
    const cred = await createUserWithEmailAndPassword(auth, emailLimpo, senha);
    if (nomeLimpo) {
      await updateProfile(cred.user, { displayName: nomeLimpo });
    }
    await sendEmailVerification(cred.user);
    setEmailVerificado(Boolean(cred.user.emailVerified));
    setAuthVersao((v) => v + 1);
  }, []);

  const entrarComGoogle = useCallback(async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const cred = await signInWithPopup(auth, provider);
    const verificado = Boolean(cred.user.emailVerified);
    if (verificado) {
      await cred.user.getIdToken(true);
    }
    setEmailVerificado(verificado);
    setAuthVersao((v) => v + 1);
  }, []);

  const enviarRecuperacaoSenha = useCallback(async (email: string) => {
    await sendPasswordResetEmail(auth, email.trim());
  }, []);

  const reenviarVerificacao = useCallback(async () => {
    const current = auth.currentUser;
    if (current) {
      await sendEmailVerification(current);
    }
  }, []);

  const recarregarUsuario = useCallback(async () => {
    const current = auth.currentUser;
    if (!current) return false;
    await reload(current);
    const verificado = Boolean(current.emailVerified);
    if (verificado) {
      await current.getIdToken(true);
    }
    setEmailVerificado(verificado);
    setUser(current);
    setAuthVersao((v) => v + 1);
    return verificado;
  }, []);

  const sair = useCallback(async () => {
    await signOut(auth);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        emailVerificado,
        authPronto,
        carregandoDados,
        artesao,
        perfilPublico,
        entrarComEmail,
        cadastrarComEmail,
        entrarComGoogle,
        enviarRecuperacaoSenha,
        reenviarVerificacao,
        recarregarUsuario,
        sair,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth deve ser utilizado dentro de AuthProvider.');
  }
  return ctx;
}

import { create } from 'zustand';
import {
  signIn, signOut, signUp, confirmSignUp,
  resendSignUpCode, getCurrentUser, fetchAuthSession,
  type SignInOutput, type SignUpOutput,
} from 'aws-amplify/auth';

interface AuthUser {
  userId: string;
  username: string;
  email: string;
}

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isInitialized: boolean;

  // Actions
  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<SignInOutput>;
  logout: () => Promise<void>;
  register: (email: string, password: string) => Promise<SignUpOutput>;
  confirmRegistration: (email: string, code: string) => Promise<void>;
  resendCode: (email: string) => Promise<void>;
  getIdToken: () => Promise<string>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: false,
  isInitialized: false,

  initialize: async () => {
    set({ isLoading: true });
    try {
      const cognitoUser = await getCurrentUser();
      const session = await fetchAuthSession();
      const claims = session.tokens?.idToken?.payload;
      set({
        user: {
          userId: cognitoUser.userId,
          username: cognitoUser.username,
          email: (claims?.['email'] as string) ?? cognitoUser.username,
        },
        isInitialized: true,
        isLoading: false,
      });
    } catch {
      // Not signed in — that's fine
      set({ user: null, isInitialized: true, isLoading: false });
    }
  },

  login: async (email: string, password: string) => {
    set({ isLoading: true });
    try {
      const result = await signIn({ username: email, password });
      if (result.isSignedIn) {
        await get().initialize();
      }
      return result;
    } finally {
      set({ isLoading: false });
    }
  },

  logout: async () => {
    set({ isLoading: true });
    try {
      await signOut();
      set({ user: null });
    } finally {
      set({ isLoading: false });
    }
  },

  register: async (email: string, password: string) => {
    return signUp({ username: email, password, options: { userAttributes: { email } } });
  },

  confirmRegistration: async (email: string, code: string) => {
    await confirmSignUp({ username: email, confirmationCode: code });
  },

  resendCode: async (email: string) => {
    await resendSignUpCode({ username: email });
  },

  getIdToken: async () => {
    const session = await fetchAuthSession();
    const token = session.tokens?.idToken?.toString();
    if (!token) throw new Error('Not authenticated');
    return token;
  },
}));

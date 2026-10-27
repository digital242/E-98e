"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User, UserRole } from "@/types/erp";

interface AuthState {
  user: User | null;
  role: UserRole | null;
  loggedInAt: string | null;
  login: (role: UserRole, user: User) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      role: null,
      loggedInAt: null,
      login: (role, user) => set({ role, user, loggedInAt: new Date().toISOString() }),
      logout: () => set({ user: null, role: null, loggedInAt: null }),
    }),
    { name: "auth-storage" }
  )
);

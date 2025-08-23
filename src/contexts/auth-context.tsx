
"use client";

import React, { createContext, useState, useEffect, ReactNode, useCallback } from 'react';
import type { User } from '@/types';
import { readDb } from '@/lib/db';
import { addUser as addUserAction, removeUser as removeUserAction, updateUserPassword as updateUserPasswordAction, updateUser as updateUserAction } from '@/lib/actions';


const CURRENT_USER_STORAGE_KEY = 'file-tracker-user';

interface AuthContextType {
  user: User | null;
  users: User[];
  loading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  addUser: (user: User) => Promise<boolean>;
  removeUser: (userId: string) => Promise<void>;
  updateUserPassword: (userId: string, newPassword: string) => Promise<void>;
  updateOwnPassword: (userId: string, currentPassword: string, newPassword: string) => Promise<boolean>;
  updateUser: (user: User) => Promise<void>;
  refreshUsers: () => Promise<void>;
  refreshCurrentUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshUsers = useCallback(async () => {
    const db = await readDb();
    setUsers(db.users);
  }, []);

  const refreshCurrentUser = useCallback(async () => {
     if (!user) return;
     const db = await readDb();
     const currentUser = db.users.find(u => u.id === user.id);
     if(currentUser) {
        const { password: _, ...userToStore } = currentUser;
        localStorage.setItem(CURRENT_USER_STORAGE_KEY, JSON.stringify(userToStore));
        setUser(userToStore);
     }
  }, [user]);


  useEffect(() => {
    const checkUser = async () => {
      setLoading(true);
      try {
        const storedCurrentUser = localStorage.getItem(CURRENT_USER_STORAGE_KEY);
        if (storedCurrentUser) {
          setUser(JSON.parse(storedCurrentUser));
        }
        await refreshUsers();
      } catch (error) {
        console.error("Failed to sync users or check current user", error);
      } finally {
        setLoading(false);
      }
    };
    checkUser();
  }, [refreshUsers]);

  const login = async (email: string, password: string): Promise<boolean> => {
    const db = await readDb();
    const userToLogin = db.users.find(u => u.email === email && u.password === password);
    if (userToLogin) {
      const { password: _, ...userToStore } = userToLogin;
      localStorage.setItem(CURRENT_USER_STORAGE_KEY, JSON.stringify(userToStore));
      setUser(userToStore);
      setUsers(db.users);
      return true;
    }
    return false;
  };

  const logout = () => {
    localStorage.removeItem(CURRENT_USER_STORAGE_KEY);
    setUser(null);
  };
  
  const addUser = async (newUser: User): Promise<boolean> => {
    const result = await addUserAction(newUser);
    if (result.success) {
      await refreshUsers();
    }
    return result.success;
  };

  const removeUser = async (userId: string) => {
    await removeUserAction(userId);
    await refreshUsers();
  };
  
  const updateUserPassword = async (userId: string, newPassword: string) => {
    await updateUserPasswordAction(userId, newPassword);
    await refreshUsers();
  };

  const updateOwnPassword = async (userId: string, currentPassword: string, newPassword: string): Promise<boolean> => {
    const db = await readDb();
    const userToUpdate = db.users.find(u => u.id === userId);

    if (!userToUpdate || userToUpdate.password !== currentPassword) {
      return false; // Current password does not match
    }

    await updateUserPasswordAction(userId, newPassword);
    return true;
  };

  const updateUser = async (updatedUser: User) => {
    await updateUserAction(updatedUser);
    await refreshUsers();
    await refreshCurrentUser();
  }

  const value = { user, users, loading, login, logout, addUser, removeUser, updateUserPassword, updateOwnPassword, updateUser, refreshUsers, refreshCurrentUser };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

    
"use client";

import React, { createContext, useState, useEffect, ReactNode, useCallback } from 'react';
import type { User } from '@/types';
import { readDb, writeDb } from '@/lib/db';
import { addUser as addUserAction } from '@/lib/actions';


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
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const syncUsersFromDb = useCallback(async () => {
    const db = await readDb();
    setUsers(db.users);
  }, []);

  useEffect(() => {
    const checkUser = async () => {
      try {
        await syncUsersFromDb();
        const storedCurrentUser = localStorage.getItem(CURRENT_USER_STORAGE_KEY);
        if (storedCurrentUser) {
          setUser(JSON.parse(storedCurrentUser));
        }
      } catch (error) {
        console.error("Failed to sync users or check current user", error);
      } finally {
        setLoading(false);
      }
    };
    checkUser();
  }, [syncUsersFromDb]);

  const login = async (email: string, password: string): Promise<boolean> => {
    const db = await readDb();
    const userToLogin = db.users.find(u => u.email === email && u.password === password);
    if (userToLogin) {
      const { password: _, ...userToStore } = userToLogin;
      localStorage.setItem(CURRENT_USER_STORAGE_KEY, JSON.stringify(userToStore));
      setUser(userToStore);
      setUsers(db.users); // Sync user list on login
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
      await syncUsersFromDb();
    }
    return result.success;
  };

  const removeUser = async (userId: string) => {
    const db = await readDb();
    const updatedUsers = db.users.filter(u => u.id !== userId);
    await writeDb({ ...db, users: updatedUsers });
    setUsers(updatedUsers);
  };
  
  const updateUserPassword = async (userId: string, newPassword: string) => {
    const db = await readDb();
    const updatedUsers = db.users.map(u => 
      u.id === userId ? { ...u, password: newPassword } : u
    );
    await writeDb({ ...db, users: updatedUsers });
    setUsers(updatedUsers);
  };

  const updateOwnPassword = async (userId: string, currentPassword: string, newPassword: string): Promise<boolean> => {
    const db = await readDb();
    const userToUpdate = db.users.find(u => u.id === userId);

    if (!userToUpdate || userToUpdate.password !== currentPassword) {
      return false; // Current password does not match
    }

    const updatedUsers = db.users.map(u =>
      u.id === userId ? { ...u, password: newPassword } : u
    );
    await writeDb({ ...db, users: updatedUsers });
    setUsers(updatedUsers);
    return true;
  };

  const value = { user, users, loading, login, logout, addUser, removeUser, updateUserPassword, updateOwnPassword };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

"use client";

import React, { createContext, useState, useEffect, ReactNode } from 'react';
import type { User } from '@/types';

const USERS_STORAGE_KEY = 'file-tracker-users';
const CURRENT_USER_STORAGE_KEY = 'file-tracker-user';

interface AuthContextType {
  user: User | null;
  users: User[];
  loading: boolean;
  login: (email: string, password: string) => boolean;
  logout: () => void;
  addUser: (user: User) => boolean;
  removeUser: (userId: string) => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

const initialAdminUser: User = {
  id: 'admin-user-01',
  name: 'Admin User',
  email: 'admin@example.com',
  password: 'password123',
  role: 'admin',
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      // Load users list
      const storedUsers = localStorage.getItem(USERS_STORAGE_KEY);
      if (storedUsers) {
        setUsers(JSON.parse(storedUsers));
      } else {
        // Initialize with default admin if no users exist
        setUsers([initialAdminUser]);
        localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify([initialAdminUser]));
      }

      // Check for currently logged-in user
      const storedCurrentUser = localStorage.getItem(CURRENT_USER_STORAGE_KEY);
      if (storedCurrentUser) {
        setUser(JSON.parse(storedCurrentUser));
      }
    } catch (error) {
      console.error("Failed to parse from localStorage", error);
      setUsers([initialAdminUser]); // Reset to default on error
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const login = (email: string, password: string): boolean => {
    const userToLogin = users.find(u => u.email === email && u.password === password);
    if (userToLogin) {
      const { password: _, ...userToStore } = userToLogin;
      localStorage.setItem(CURRENT_USER_STORAGE_KEY, JSON.stringify(userToStore));
      setUser(userToStore);
      return true;
    }
    return false;
  };

  const logout = () => {
    localStorage.removeItem(CURRENT_USER_STORAGE_KEY);
    setUser(null);
  };
  
  const addUser = (newUser: User): boolean => {
    const userExists = users.some(u => u.email === newUser.email);
    if (userExists) {
      return false; // Indicate failure
    }
    const updatedUsers = [...users, newUser];
    setUsers(updatedUsers);
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(updatedUsers));
    return true; // Indicate success
  };

  const removeUser = (userId: string) => {
    const updatedUsers = users.filter(u => u.id !== userId);
    setUsers(updatedUsers);
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(updatedUsers));
  };


  const value = { user, users, loading, login, logout, addUser, removeUser };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

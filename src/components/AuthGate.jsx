import React from "react";
import { useAuth } from "./AuthProvider.jsx";
import LoginScreen from "./LoginScreen.jsx";

export default function AuthGate({ children }) {
  const { user, loading, error } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center text-sm text-stone-600">
        Checking your session…
      </div>
    );
  }

  if (!user) return <LoginScreen configurationError={error} />;
  return children;
}

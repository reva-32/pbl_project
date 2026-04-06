import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

interface StoredUser {
  _id: string;
  email: string;
  companyName: string;
  ownerName: string;
  phone: string;
  businessType?: string;
  city?: string;
  gstin?: string;
  googleSheetId?: string | null;
}

/**
 * Global auth state hook.
 *
 * Reads the JWT token and user profile from localStorage synchronously —
 * no context provider needed. Call this from any component that needs to
 * know if the user is logged in.
 */
export function useAuth() {
  const navigate = useNavigate();

  const token = localStorage.getItem("token");

  const user = (() => {
    try {
      const raw = localStorage.getItem("user");
      if (!raw) return null;
      return JSON.parse(raw) as StoredUser;
    } catch {
      return null;
    }
  })();

  const isAuthenticated = Boolean(token && user);

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/");
  }, [navigate]);

  return { isAuthenticated, token, user, logout };
}

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { supabase } from "./supabase";

export type Restaurant = {
  id: string;
  name: string;
  role?: string;
  is_active?: boolean;
};

type Ctx = {
  current: Restaurant | null;
  list: Restaurant[];
  setCurrent: (r: Restaurant) => void;
  refresh: () => Promise<Restaurant[]>;
  createRestaurant: (name: string) => Promise<Restaurant | null>;
  loading: boolean;
};

const RestaurantContext = createContext<Ctx>({
  current: null,
  list: [],
  setCurrent: () => {},
  refresh: async () => [],
  createRestaurant: async () => null,
  loading: true,
});

const LS_KEY = "active_restaurant_id";

async function fetchList(): Promise<Restaurant[]> {
  // Reads `restaurants` directly via RLS — owner sees only their own row(s).
  const { data, error } = await supabase
    .from("restaurants")
    .select("id, name, is_active")
    .eq("is_active", true)
    .order("name");
  if (error) {
    console.error(error);
    return [];
  }
  return (data as Restaurant[]) || [];
}

export function RestaurantProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Restaurant[]>([]);
  const [current, setCurrentState] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const restaurants = await fetchList();
    setList(restaurants);
    return restaurants;
  }, []);

  useEffect(() => {
    (async () => {
      const restaurants = await refresh();
      const saved =
        typeof window !== "undefined"
          ? localStorage.getItem(LS_KEY)
          : null;
      const initial =
        restaurants.find((r) => r.id === saved) || restaurants[0] || null;
      setCurrentState(initial);
      setLoading(false);
    })();
  }, [refresh]);

  const setCurrent = useCallback((r: Restaurant) => {
    setCurrentState(r);
    if (typeof window !== "undefined") localStorage.setItem(LS_KEY, r.id);
  }, []);

  /** Create a restaurant + auto-grant ownership + switch to it. */
  const createRestaurant = useCallback(
    async (name: string): Promise<Restaurant | null> => {
      const { data, error } = await supabase.rpc("create_my_restaurant", {
        p_name: name,
      });
      if (error) {
        console.error(error);
        throw error;
      }
      const newId = data as string;
      const restaurants = await refresh();
      const newOne = restaurants.find((r) => r.id === newId) || null;
      if (newOne) setCurrent(newOne);
      return newOne;
    },
    [refresh, setCurrent]
  );

  return (
    <RestaurantContext.Provider
      value={{ current, list, setCurrent, refresh, createRestaurant, loading }}
    >
      {children}
    </RestaurantContext.Provider>
  );
}

export const useRestaurant = () => useContext(RestaurantContext);

"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRestaurant } from "@/lib/restaurant";

export default function SettingsPage() {
  const { current } = useRestaurant();

  // ── Restaurant Depot fields (stored on the `restaurants` row) ─────
  const [rdEmail, setRdEmail] = useState("");
  const [rdPassword, setRdPassword] = useState("");
  const [rdStoreNumber, setRdStoreNumber] = useState("");
  const [driveFolderId, setDriveFolderId] = useState("");
  const [hasRdPassword, setHasRdPassword] = useState(false);
  const [rdStatus, setRdStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [rdError, setRdError] = useState("");

  // ── Apify sync trigger ────────────────────────────────────────────
  const [apifyRunning, setApifyRunning] = useState(false);
  const [apifyMsg, setApifyMsg] = useState("");
  const [apifyDetailUrl, setApifyDetailUrl] = useState("");

  // ── Clover fields (stored on `restaurant_settings`) ───────────────
  const [merchantId, setMerchantId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [cloverStatus, setCloverStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [cloverError, setCloverError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");

  // Load existing settings when restaurant changes
  useEffect(() => {
    if (!current) return;
    (async () => {
      // RD creds + drive folder live on `restaurants`
      const { data: r } = await supabase
        .from("restaurants")
        .select("rd_email, rd_password, rd_store_number, drive_folder_id")
        .eq("id", current.id)
        .maybeSingle();
      if (r) {
        setRdEmail(r.rd_email || "");
        setRdStoreNumber(r.rd_store_number || "");
        setDriveFolderId(r.drive_folder_id || "");
        if (r.rd_password) {
          setRdPassword("••••••••");
          setHasRdPassword(true);
        } else {
          setRdPassword("");
          setHasRdPassword(false);
        }
      }

      // Clover lives on `restaurant_settings`
      const { data: s } = await supabase
        .from("restaurant_settings")
        .select("clover_merchant_id, clover_api_key")
        .eq("restaurant_id", current.id)
        .maybeSingle();
      if (s) {
        setMerchantId(s.clover_merchant_id || "");
        if (s.clover_api_key) {
          setApiKey("••••••••");
          setHasKey(true);
        }
      }
    })();
  }, [current]);

  // ── Save Restaurant Depot creds ───────────────────────────────────
  async function saveRD() {
    if (!current) return;
    setRdStatus("saving");
    setRdError("");
    const update: Record<string, any> = {
      rd_email: rdEmail.trim() || null,
      rd_store_number: rdStoreNumber.trim() || null,
      drive_folder_id: driveFolderId.trim() || null,
    };
    // Only update password if user changed it (not the placeholder dots)
    if (!rdPassword.startsWith("••")) {
      update.rd_password = rdPassword.trim() || null;
    }
    const { error } = await supabase
      .from("restaurants")
      .update(update)
      .eq("id", current.id);
    if (error) {
      setRdStatus("error");
      setRdError(error.message);
      return;
    }
    if (rdPassword.trim() && !rdPassword.startsWith("••"))
      setHasRdPassword(true);
    setRdStatus("saved");
    setTimeout(() => setRdStatus("idle"), 3000);
  }

  // ── Trigger Apify run ─────────────────────────────────────────────
  async function triggerApify() {
    setApifyRunning(true);
    setApifyMsg("");
    setApifyDetailUrl("");
    try {
      const resp = await fetch("/api/apify-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await resp.json();
      if (!resp.ok) {
        setApifyMsg(`❌ ${json.error || "Trigger failed"}`);
      } else {
        setApifyMsg(
          `✅ Run started — status: ${json.status}. Receipts will populate as they're processed.`
        );
        if (json.detail_url) setApifyDetailUrl(json.detail_url);
      }
    } catch (e: any) {
      setApifyMsg(`❌ ${e.message}`);
    } finally {
      setApifyRunning(false);
    }
  }

  // ── Save Clover ───────────────────────────────────────────────────
  async function saveClover() {
    if (!current) return;
    setCloverStatus("saving");
    setCloverError("");
    const payload: Record<string, any> = {
      restaurant_id: current.id,
      clover_merchant_id: merchantId.trim() || null,
    };
    if (!apiKey.startsWith("••")) {
      payload.clover_api_key = apiKey.trim() || null;
    }
    const { error } = await supabase
      .from("restaurant_settings")
      .upsert(payload, { onConflict: "restaurant_id" });
    if (error) {
      setCloverStatus("error");
      setCloverError(error.message);
      return;
    }
    if (apiKey.trim() && !apiKey.startsWith("••")) setHasKey(true);
    setCloverStatus("saved");
    setTimeout(() => setCloverStatus("idle"), 3000);
  }

  async function triggerCloverSync() {
    if (!current) return;
    setSyncing(true);
    setSyncMsg("");
    try {
      const resp = await fetch("/api/clover-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurant_id: current.id }),
      });
      const json = await resp.json();
      setSyncMsg(
        resp.ok
          ? `✅ Synced ${json.count} sales records.`
          : `❌ ${json.error || "Sync failed"}`
      );
    } catch (e: any) {
      setSyncMsg(`❌ ${e.message}`);
    } finally {
      setSyncing(false);
    }
  }

  const rdConnected = !!(rdEmail.trim() && hasRdPassword && rdStoreNumber.trim());
  const cloverConnected = !!(merchantId.trim() && hasKey);

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-slate-600 mt-1">
          {current
            ? `Manage integrations for ${current.name}.`
            : "Pick a restaurant first."}
        </p>
      </div>

      {/* ─── Restaurant Depot ───────────────────────────────────── */}
      <section className="card p-6 space-y-5">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🏬</span>
          <div className="flex-1">
            <div className="font-semibold flex items-center gap-2">
              Restaurant Depot
              {rdConnected && (
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                  ✓ Configured
                </span>
              )}
            </div>
            <div className="text-sm text-slate-500">
              Auto-pull receipts via the Apify scraper
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5 uppercase tracking-wide">
              RD Login Email
            </label>
            <input
              value={rdEmail}
              onChange={(e) => setRdEmail(e.target.value)}
              placeholder="owner@email.com"
              className="input w-full"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5 uppercase tracking-wide">
              RD Password
            </label>
            <input
              value={rdPassword}
              onChange={(e) => {
                setRdPassword(e.target.value);
                if (e.target.value === "") setHasRdPassword(false);
              }}
              type="password"
              placeholder="••••••••"
              className="input w-full"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5 uppercase tracking-wide">
              Store Number
            </label>
            <input
              value={rdStoreNumber}
              onChange={(e) => setRdStoreNumber(e.target.value)}
              placeholder="e.g. 79"
              className="input w-full"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5 uppercase tracking-wide">
              Google Drive Folder ID
            </label>
            <input
              value={driveFolderId}
              onChange={(e) => setDriveFolderId(e.target.value)}
              placeholder="Optional — for Drive backups"
              className="input w-full"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={saveRD}
            disabled={rdStatus === "saving" || !current}
            className="btn-primary"
          >
            {rdStatus === "saving" ? "Saving…" : "Save Credentials"}
          </button>
          {rdStatus === "saved" && (
            <span className="text-sm text-green-600">✓ Saved</span>
          )}
          {rdStatus === "error" && (
            <span className="text-sm text-red-600">❌ {rdError}</span>
          )}
        </div>

        {rdConnected && (
          <div className="border-t border-slate-200/70 pt-5">
            <div className="flex justify-between items-center">
              <div>
                <div className="text-sm font-medium">Run Sync Now</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Triggers the Apify actor to pull new receipts immediately
                </div>
              </div>
              <button
                onClick={triggerApify}
                disabled={apifyRunning}
                className="btn-ghost"
              >
                {apifyRunning ? "Triggering…" : "Run Now"}
              </button>
            </div>
            {apifyMsg && (
              <p className="text-sm text-slate-700 mt-2">
                {apifyMsg}
                {apifyDetailUrl && (
                  <>
                    {" "}
                    <a
                      href={apifyDetailUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      View run →
                    </a>
                  </>
                )}
              </p>
            )}
          </div>
        )}
      </section>

      {/* ─── Clover POS ─────────────────────────────────────────── */}
      <section className="card p-6 space-y-5">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🍀</span>
          <div className="flex-1">
            <div className="font-semibold flex items-center gap-2">
              Clover POS
              {cloverConnected && (
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                  ✓ Connected
                </span>
              )}
            </div>
            <div className="text-sm text-slate-500">
              Pull sales data to enable wastage tracking
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5 uppercase tracking-wide">
              Merchant ID
            </label>
            <input
              value={merchantId}
              onChange={(e) => setMerchantId(e.target.value)}
              placeholder="e.g. ABC12DEFGHIJK"
              className="input w-full"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5 uppercase tracking-wide">
              API Token
            </label>
            <input
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                if (e.target.value === "") setHasKey(false);
              }}
              type="password"
              placeholder="••••••••"
              className="input w-full"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={saveClover}
            disabled={cloverStatus === "saving" || !current}
            className="btn-primary"
          >
            {cloverStatus === "saving" ? "Saving…" : "Save"}
          </button>
          {cloverStatus === "saved" && (
            <span className="text-sm text-green-600">✓ Saved</span>
          )}
          {cloverStatus === "error" && (
            <span className="text-sm text-red-600">❌ {cloverError}</span>
          )}
        </div>

        {cloverConnected && (
          <div className="border-t border-slate-200/70 pt-5">
            <div className="flex justify-between items-center">
              <div>
                <div className="text-sm font-medium">Sync Sales Data</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Pull last 30 days of orders from Clover
                </div>
              </div>
              <button
                onClick={triggerCloverSync}
                disabled={syncing}
                className="btn-ghost"
              >
                {syncing ? "Syncing…" : "Sync Now"}
              </button>
            </div>
            {syncMsg && (
              <p className="text-sm text-slate-700 mt-2">{syncMsg}</p>
            )}
          </div>
        )}
      </section>

      <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-6 text-center text-slate-500">
        <div className="text-sm font-medium">More integrations coming soon</div>
        <div className="text-xs mt-1">Costco · Gordon Food Service · Sysco · Square · Toast</div>
      </div>
    </div>
  );
}

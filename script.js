(() => {
  const $ = (s) => document.querySelector(s),
    K = "student_ledger_data",
    KS = "student_ledger_settings";
  const ld = (k, d) => {
    try {
      return JSON.parse(localStorage.getItem(k)) ?? d;
    } catch {
      return d;
    }
  };
  let tx = ld(K, []);
  if (!Array.isArray(tx)) tx = [];
  let S = Object.assign({}, ld(KS, {}));
  let eid = null,
    cfn = null,
    tt;
  const ovs = [];

  const save = () => {
    try {
      localStorage.setItem(K, JSON.stringify(tx));
      localStorage.setItem(KS, JSON.stringify(S));
      return true;
    } catch {
      toast("Storage is full or blocked", 1);
      return false;
    }
  };
  const esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const peso = (n) =>
    "₱" +
    (Number(n) || 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const today = () => {
    const x = new Date();
    return new Date(x - x.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 10);
  };
  const wd = (s) => {
    const d = new Date(s + "T00:00");
    return isNaN(d) ? "" : d.toLocaleDateString("en-US", { weekday: "short" });
  };
  const fdt = (s) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    return m ? m[2] + "/" + m[3] + "/" + m[1] : s;
  };
  const isS = (t) => t.type === "Savings";
  const find = (id) => tx.find((x) => String(x.id) === String(id));

  function toast(m, err) {
    const t = $("#toast");
    t.className = "toast" + (err ? " e" : "");
    t.textContent = m;
    $("#tc").classList.add("on");
    clearTimeout(tt);
    tt = setTimeout(() => $("#tc").classList.remove("on"), 2200);
  }

  /* ---------- Views / back stack ----------
     Every overlay pushes one history entry, so the system/hardware back
     button (popstate or Capacitor backButton) closes the top-most view. */
  function openOv(id) {
    ovs.push(id);
    $("#" + id).classList.add("on");
    history.pushState({ ov: id }, "");
  }
  function closeTop() {
    const id = ovs.pop();
    if (id) $("#" + id).classList.remove("on");
  }
  function back() {
    if (ovs.length) history.back();
  }
  addEventListener("popstate", closeTop);
  try {
    window.Capacitor?.Plugins?.App?.addListener?.("backButton", () => {
      if (ovs.length) history.back();
      else window.Capacitor.Plugins.App.exitApp?.();
    });
  } catch {}

  function ask(title, msg, btn, fn) {
    $("#cT").textContent = title;
    $("#cM").textContent = msg;
    $("#cB").textContent = btn;
    cfn = fn;
    openOv("cf");
  }

  /* ---------- Rendering ---------- */
  function renderLogs() {
    const r = tx
      .filter(isS)
      .sort(
        (x, y) =>
          y.date.localeCompare(x.date) ||
          String(y.id).localeCompare(String(x.id)),
      );
    $("#tb").innerHTML = r.length
      ? r
          .map((t) => {
            const id = esc(t.id);
            return `<tr><td class="d"><b>${esc(wd(t.date))},</b>${esc(fdt(t.date))}</td><td class="a">${peso(t.amount)}</td><td>${esc(t.note)}</td><td class="c"><button class="ra" data-a="edit" data-v="${id}" aria-label="Edit" title="Edit">✏️</button><button class="ra del" data-a="del" data-v="${id}" aria-label="Delete" title="Delete">🗑️</button></td></tr>`;
          })
          .join("")
      : '<tr><td class="e" colspan="4">No entries yet.</td></tr>';
  }
  function renderFooter() {
    const n = tx.filter(isS).length;
    $("#fc").textContent = n + (n === 1 ? " entry" : " entries");
    $("#fb").textContent = S.bk
      ? "Last backup: " +
        new Date(S.bk).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "No backup yet";
  }
  const render = () => {
    renderLogs();
    renderFooter();
  };

  /* ---------- Export / import ---------- */
  async function dl(text, name, mime) {
    const cap = window.Capacitor?.Plugins;
    try {
      // 1) Real "Save as" dialog: user names the file and picks the folder
      if (window.showSaveFilePicker) {
        const h = await showSaveFilePicker({
          suggestedName: name,
          types: [{ description: "Backup", accept: { [mime]: [".json"] } }],
        });
        const w = await h.createWritable();
        await w.write(text);
        await w.close();
        return true;
      }
      // 2) Capacitor app: write a file, then open the native share/save sheet
      if (cap?.Filesystem && cap?.Share) {
        const r = await cap.Filesystem.writeFile({
          path: name,
          data: text,
          directory: "CACHE",
          encoding: "utf8",
        });
        await cap.Share.share({
          title: name,
          url: r.uri,
          dialogTitle: "Save backup",
        });
        return true;
      }
      // 3) Mobile browser: Web Share with a file
      const file = new File([text], name, { type: mime });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: name });
        return true;
      }
    } catch (e) {
      if (e?.name === "AbortError" || /cancel/i.test(e?.message || ""))
        return false;
      console.warn("Native save failed, using fallback", e);
    }
    // 4) Fallback: classic download
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: mime }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    return true;
  }

  /* ---------- Actions ---------- */
  const actions = {
    logs() {
      renderLogs();
      openOv("lg");
    },
    back,
    edit(id) {
      const t = find(id);
      if (!t) return;
      eid = id;
      $("#eA").value = t.amount;
      $("#eD").value = t.date;
      $("#eN").value = t.note || "";
      openOv("ed");
    },
    esave() {
      const t = find(eid),
        a = +$("#eA").value,
        d = $("#eD").value;
      if (!t) return;
      if (!(a > 0) || !Number.isFinite(a) || !d)
        return toast("Enter a valid amount and date", 1);
      t.amount = a;
      t.date = d;
      t.note = $("#eN").value.trim();
      if (!save()) return;
      render();
      back();
      toast("Entry updated");
    },
    delall() {
      ask(
        "Delete all data?",
        "Are you sure you want to delete this data? This action cannot be undone.",
        "Delete",
        () => {
          tx = [];
          if (save()) {
            render();
            toast("All data deleted");
          }
        },
      );
    },
    del(id) {
      if (!find(id)) return;
      ask(
        "Delete data?",
        "Are you sure you want to delete this data? This action cannot be undone.",
        "Delete",
        () => {
          tx = tx.filter((x) => String(x.id) !== String(id));
          if (save()) {
            render();
            toast("Entry deleted");
          }
        },
      );
    },
    cyes() {
      const f = cfn;
      cfn = null;
      if (f) f();
      back();
    },
    async exp() {
      const ok = await dl(
        JSON.stringify(
          {
            app: "personal-recorder",
            v: 3,
            at: new Date().toISOString(),
            transactions: tx,
          },
          null,
          2,
        ),
        "personal-recorder-backup-" + today() + ".json",
        "application/json",
      );
      if (!ok) return;
      S.bk = Date.now();
      save();
      renderFooter();
      toast("Backup exported");
    },
    imp() {
      $("#imf").click();
    },
  };
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-a]");
    if (b && actions[b.dataset.a]) actions[b.dataset.a](b.dataset.v, b);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") back();
  });

  $("#imf").addEventListener("change", (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const j = JSON.parse(r.result),
          a = Array.isArray(j) ? j : j.transactions;
        if (!Array.isArray(a)) throw Error();
        const ok = a
          .filter(
            (t) =>
              t &&
              /^\d{4}-\d{2}-\d{2}$/.test(String(t.date)) &&
              Number.isFinite(+t.amount) &&
              +t.amount > 0 &&
              (t.type === "Savings" || t.type === "Money Sent"),
          )
          .map((t, i) => ({
            id: String(t.id || "tx_" + Date.now() + "_" + i),
            date: String(t.date),
            type: t.type,
            recipient: t.recipient || "—",
            address: t.address || "—",
            amount: +t.amount,
            note: String(t.note || "").slice(0, 60),
          }));
        ask(
          "Replace current data?",
          "Found " +
            ok.length +
            " valid entries. This replaces your current records.",
          "Restore",
          () => {
            tx = ok;
            if (save()) {
              render();
              toast("Backup restored");
            }
          },
        );
      } catch {
        toast("That file is not a valid backup", 1);
      }
    };
    r.readAsText(f);
  });

  /* ---------- Record form ---------- */
  $("#f").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target;
    if (!f.reportValidity()) return;
    const a = +f.elements.amount.value,
      d = f.elements.date.value;
    if (!(a > 0) || !Number.isFinite(a) || !d)
      return toast("Enter a valid amount and date", 1);
    tx.unshift({
      id: "tx_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
      date: d,
      type: "Savings",
      recipient: "—",
      address: "—",
      amount: a,
      note: f.elements.note.value.trim(),
    });
    if (!save()) {
      tx.shift();
      return;
    }
    f.reset();
    f.elements.date.value = today();
    render();
    toast("Saved");
  });

  $("#f").elements.date.value = today();
  render();
})();

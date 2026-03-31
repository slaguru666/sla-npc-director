const MODULE_ID = "sla-npc-director";
const FLAG_KEY = "directorState";
const STANCE_OPTIONS = ["Aggressive", "Holding", "Defensive", "Broken"];
const MORALE_OPTIONS = ["Steady", "Shaken", "Fragile", "Collapsed"];
const SUPPRESSION_OPTIONS = ["0", "1", "2", "3"];
const INTENT_OPTIONS = ["Rush", "Flank", "Hold", "Suppress", "Fallback", "Flee"];

function getHtmlRoot(html) {
  return html instanceof HTMLElement ? html : html?.[0] ?? null;
}

function getTargets() {
  const selectedTokens = canvas?.tokens?.controlled?.map((token) => token.document) ?? [];
  if (selectedTokens.length) return selectedTokens;

  const combatants = game.combat?.combatants?.map((combatant) => combatant.token ?? combatant.actor)?.filter(Boolean) ?? [];
  return combatants;
}

function readState(document) {
  return foundry.utils.mergeObject(
    {
      stance: "Holding",
      morale: "Steady",
      suppression: "0",
      intent: "Hold",
      note: ""
    },
    document?.getFlag?.(MODULE_ID, FLAG_KEY) ?? {}
  );
}

async function writeState(document, state) {
  if (!document?.setFlag) return;
  await document.setFlag(MODULE_ID, FLAG_KEY, state);
}

function buildSummary(entries) {
  const lines = entries.map((entry) => {
    const note = entry.note ? ` | ${foundry.utils.escapeHTML(entry.note)}` : "";
    return `<li><strong>${foundry.utils.escapeHTML(entry.name)}</strong>: ${entry.stance}, ${entry.morale}, suppression ${entry.suppression}, intent ${entry.intent}${note}</li>`;
  }).join("");
  return `<section class="sla-npc-director-summary"><h2>SLA NPC Director</h2><ul>${lines}</ul></section>`;
}

class SlaNpcDirectorApp extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "sla-npc-director-app",
      title: "SLA NPC Director",
      template: "modules/sla-npc-director/templates/npc-director.hbs",
      classes: ["sla-npc-director"],
      width: 980,
      height: "auto",
      closeOnSubmit: false,
      submitOnChange: false,
      resizable: true
    });
  }

  async getData() {
    const entries = getTargets().map((document) => ({
      name: document.name ?? document.actor?.name ?? "Unknown",
      docId: document.id,
      docType: document.documentName,
      ...readState(document)
    }));

    return {
      entries,
      stanceOptions: STANCE_OPTIONS,
      moraleOptions: MORALE_OPTIONS,
      suppressionOptions: SUPPRESSION_OPTIONS,
      intentOptions: INTENT_OPTIONS
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find("[data-action='refresh']").on("click", () => this.render(false));
    html.find("[data-action='save']").on("click", async () => {
      await this._saveRows();
      ui.notifications.info("SLA NPC Director states saved.");
    });
    html.find("[data-action='chat']").on("click", async () => {
      const entries = await this._saveRows();
      await ChatMessage.create({
        user: game.user.id,
        speaker: { alias: "SLA NPC Director" },
        whisper: ChatMessage.getWhisperRecipients("GM"),
        content: buildSummary(entries)
      });
    });
  }

  async _saveRows() {
    const rows = Array.from(this.form?.querySelectorAll(".sla-npc-director-row") ?? []);
    const summaries = [];
    for (const row of rows) {
      const docId = row.dataset.docId;
      const document = canvas?.scene?.tokens?.get?.(docId) ?? game.combat?.combatants?.find((combatant) => combatant.token?.id === docId)?.token;
      if (!document) continue;
      const state = {
        stance: row.querySelector("[data-field='stance']")?.value ?? "Holding",
        morale: row.querySelector("[data-field='morale']")?.value ?? "Steady",
        suppression: row.querySelector("[data-field='suppression']")?.value ?? "0",
        intent: row.querySelector("[data-field='intent']")?.value ?? "Hold",
        note: row.querySelector("[data-field='note']")?.value ?? ""
      };
      await writeState(document, state);
      summaries.push({ name: document.name ?? document.actor?.name ?? "Unknown", ...state });
    }
    return summaries;
  }

  async _updateObject() {
    await this._saveRows();
  }

  static open() {
    return new SlaNpcDirectorApp().render(true);
  }
}

function appendOpenButton(root, selector, className, label) {
  const header = root?.querySelector(selector);
  if (!header || header.querySelector(`.${className}`)) return false;
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.innerHTML = `<i class="fas fa-user-shield"></i> ${label}`;
  button.addEventListener("click", () => SlaNpcDirectorApp.open());
  header.appendChild(button);
  return true;
}

function installCombatButton(app, html) {
  const root = getHtmlRoot(html);
  appendOpenButton(root, ".directory-header .header-actions, .directory-header .action-buttons, .combat-sidebar .encounter-controls", "sla-npc-director-open", "NPC Director");
}

function installActorDirectoryButton(app, html) {
  const root = getHtmlRoot(html);
  appendOpenButton(root, ".directory-header .header-actions, .directory-header .action-buttons", "sla-npc-director-actor-open", "NPC Director");
}

function installSettingsButton(app, html) {
  const root = getHtmlRoot(html);
  appendOpenButton(root, ".settings-sidebar #game-details, .settings-sidebar .directory-header .header-actions, .settings-sidebar .action-buttons", "sla-npc-director-settings-open", "NPC Director");
}

Hooks.once("init", () => {
  Handlebars.registerHelper("eq", (left, right) => left === right);
  game.settings.registerMenu(MODULE_ID, "npcDirectorMenu", {
    name: "SLA NPC Director",
    label: "Open NPC Director",
    hint: "Track combat stance, morale, suppression, and intent for current targets.",
    icon: "fas fa-user-shield",
    type: SlaNpcDirectorApp,
    restricted: true
  });
});

Hooks.on("renderCombatTracker", installCombatButton);
Hooks.on("renderActorDirectory", installActorDirectoryButton);
Hooks.on("renderSettings", installSettingsButton);

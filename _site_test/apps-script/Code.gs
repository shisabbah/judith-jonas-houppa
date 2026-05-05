/**
 * À coller dans Google Apps Script (Feuille → Extensions → Apps Script),
 * ou https://script.google.com → projet lié au tableur.
 *
 * Déploiement : Déployer → Nouveau déploiement → Type « Application Web »
 * - Exécuter en tant que : Moi (obligatoire pour les invités anonymes ; sinon Spreadsheet peut être indisponible)
 * - Qui a accès : Tout le monde (pour que les invités puissent envoyer sans compte)
 * Copier l’URL /exec dans main.js → GOOGLE_SHEETS_CONFIG.webAppUrl
 * Le site envoie les données en GET en arrière-plan (fetch), sans ouvrir de page Google chez l’invité.
 *
 * Optionnel — secret anti-spam : Fichier → Paramètres du projet → Propriétés du script
 * Clé : RSVP_SECRET   Valeur : (mot de passe) — la même dans main.js secretToken
 *
 * Optionnel — ID classeur : propriété SPREADSHEET_ID ; sinon valeur par défaut ci‑dessous dans getSpreadsheetId_().
 */

/** ID du classeur J&J (toujours défini ici pour éviter « SPREADSHEET_ID is not defined » si le collage Google est incomplet). */
function getSpreadsheetId_() {
  /* ID copié depuis l’URL du classeur : …/spreadsheets/d/CET_ID/edit */
  var fallback = "1iPO-9Uw9euOToCM8pgetefg0dnAtEnwx9dfp4sT13Ww";
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty("SPREADSHEET_ID");
  if (id && String(id).trim()) {
    var t = String(id).trim();
    var bogus = /^undefined|null$/i.test(t);
    if (!bogus) {
      return t;
    }
  }
  return fallback;
}

/**
 * Ouvre le classeur pour les écritures RSVP.
 * Retourne { book, err } — book est le Spreadsheet ou null (jamais de propriété intermédiaire « ss »).
 * 1) Script lié + classeur actif dont l’ID correspond → ce classeur
 * 2) Sinon SpreadsheetApp.openById(id)
 */
function openBookForRsvp_() {
  var id = getSpreadsheetId_();
  if (!id) {
    return { book: null, err: "SPREADSHEET_ID vide" };
  }

  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) {
    try {
      if (String(active.getId()) === String(id)) {
        return { book: active, err: null };
      }
    } catch (ignoreActive) {
      /* openById ci‑dessous */
    }
  }

  try {
    var opened = SpreadsheetApp.openById(id);
    if (opened == null) {
      return {
        book: null,
        err:
          "openById a renvoyé null — ID, partage du classeur, ou déploiement « Exécuter en tant que : Moi ».",
      };
    }
    return { book: opened, err: null };
  } catch (err) {
    return { book: null, err: err.message || String(err) };
  }
}

/** Nom de l’onglet dans le classeur Google Sheet */
var SHEET_NAME = "J&J";

/** Feuille SHEET_NAME dans le classeur donné (création si besoin). book doit être non null. */
function getOrCreateSheet_(book) {
  if (!SHEET_NAME || String(SHEET_NAME).trim() === "") {
    return book.getSheets()[0];
  }
  var sh = book.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = book.insertSheet(SHEET_NAME);
  }
  return sh;
}

function decodeURIComponentSafe_(s) {
  try {
    return decodeURIComponent(String(s).replace(/\+/g, " "));
  } catch (err) {
    return String(s);
  }
}

/** Fusionne postData (corps brut) et e.parameter (souvent identiques côté Google). */
function parseUrlEncodedInto_(contents, target) {
  var pairs = String(contents).split("&");
  for (var i = 0; i < pairs.length; i++) {
    if (!pairs[i]) continue;
    var eq = pairs[i].indexOf("=");
    var rawKey = eq === -1 ? pairs[i] : pairs[i].substring(0, eq);
    var rawVal = eq === -1 ? "" : pairs[i].substring(eq + 1);
    var key = decodeURIComponentSafe_(rawKey);
    var val = decodeURIComponentSafe_(rawVal);
    target[key] = val;
  }
}

/** Lit les champs POST : corps brut d’abord, puis e.parameter écrase si besoin. */
function parsePostParameters_(e) {
  var p = {};
  if (!e) return p;
  if (e.postData && e.postData.contents) {
    parseUrlEncodedInto_(e.postData.contents, p);
  }
  if (e.parameter) {
    for (var k in e.parameter) {
      if (Object.prototype.hasOwnProperty.call(e.parameter, k)) {
        p[k] = e.parameter[k];
      }
    }
  }
  return p;
}

/** Logique commune POST (corps) et GET (?champs=…) — le site envoie en GET pour fiabilité navigateur. */
function appendRsvpRow_(p) {
  var secret = PropertiesService.getScriptProperties().getProperty("RSVP_SECRET");
  if (secret && String(secret).length > 0 && p.token !== secret) {
    return { ok: false, message: "denied" };
  }

  var opened = openBookForRsvp_();
  if (opened.book == null) {
    return { ok: false, message: "error: " + (opened.err || "classeur introuvable") };
  }
  var book = opened.book;
  var sh = getOrCreateSheet_(book);

  var row = [
    new Date(),
    p["mairie-nom"] || "",
    p["mairie-prenom"] || "",
    p["mairie-nb"] || "",
    p["houppa-nom"] || "",
    p["houppa-prenom"] || "",
    p["houppa-nb"] || "",
    p["henne-nom"] || "",
    p["henne-prenom"] || "",
    p["henne-nb"] || "",
  ];
  sh.appendRow(row);
  return { ok: true };
}

function doPost(e) {
  try {
    var p = parsePostParameters_(e || {});
    var r = appendRsvpRow_(p);
    if (!r.ok) {
      return HtmlService.createHtmlOutput(r.message);
    }
    return HtmlService.createHtmlOutput("ok");
  } catch (err) {
    return HtmlService.createHtmlOutput("error: " + err.message);
  }
}

/** GET : mêmes paramètres dans l’URL (utilisé par le site — contourne les blocages POST). */
function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    var r = appendRsvpRow_(p);
    if (!r.ok) {
      return HtmlService.createHtmlOutput(r.message);
    }
    return HtmlService.createHtmlOutput("ok");
  } catch (err) {
    return HtmlService.createHtmlOutput("error: " + err.message);
  }
}

/** À exécuter une fois dans l’éditeur (▶) pour créer la ligne d’en-têtes */
function creerEnTetes() {
  var opened = openBookForRsvp_();
  if (opened.book == null) {
    throw new Error(opened.err || "Impossible d’ouvrir le classeur");
  }
  var sh = getOrCreateSheet_(opened.book);
  sh
    .getRange(1, 1, 1, 10)
    .setValues([
      [
        "Horodatage",
        "Mairie — nom",
        "Mairie — prénom",
        "Mairie — nombre",
        "Houppa — nom",
        "Houppa — prénom",
        "Houppa — nombre",
        "Henné — nom",
        "Henné — prénom",
        "Henné — nombre",
      ],
    ]);
}

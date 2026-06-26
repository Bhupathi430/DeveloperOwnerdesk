/**
 * Nexure Studios - Unified Database Adapter (db.js)
 * Implements a dual-mode database:
 * 1. LocalStorage Mode (Default): Runs out of the box with zero configuration, keeping data persisted in browser storage.
 * 2. Firebase Mode: Connects to a real Firestore instance when configured via Settings.
 */

(function () {
  const DB_CONFIG_KEY = "nexure_db_config";
  const LOCAL_DB_PREFIX = "nexure_db_";

  // Default Seed Data
  const DEFAULT_SEEDS = {
    owners: {
      "9696": {
        id: "9696",
        username: "9696",
        password: "9696",
        name: "Master Owner"
      }
    },
    employees: {
      "EMP-101": {
        id: "EMP-101",
        name: "Karan Sharma",
        email: "karan@nexure.com",
        phone: "+91 98765 43210",
        role: "Lead UI/UX Designer",
        password: "karan",
        avatar: "https://api.dicebear.com/7.x/adventurer/svg?seed=karan"
      },
      "EMP-102": {
        id: "EMP-102",
        name: "Aisha Verma",
        email: "aisha@nexure.com",
        phone: "+91 87654 32109",
        role: "Senior Full-Stack Developer",
        password: "aisha",
        avatar: "https://api.dicebear.com/7.x/adventurer/svg?seed=aisha"
      }
    },
    projects: {
      "PRJ-301": {
        id: "PRJ-301",
        name: "Aura Website Rebrand",
        description: "Redesign landing page and develop interactive client portal with smooth animations.",
        assignedTo: "EMP-101",
        deadline: "2026-07-05",
        status: "In Progress"
      },
      "PRJ-302": {
        id: "PRJ-302",
        name: "Mobile App Core API",
        description: "Implement high-performance RESTful APIs for the Nexure mobile app.",
        assignedTo: "EMP-102",
        deadline: "2026-06-30",
        status: "Pending"
      },
      "PRJ-303": {
        id: "PRJ-303",
        name: "PhonePe Gateway Integration",
        description: "Set up UPI deep links and QR codes for payment scanning.",
        assignedTo: "EMP-102",
        deadline: "2026-06-25",
        status: "Completed"
      }
    },
    attendance: {
      "ATT-001": {
        id: "ATT-001",
        employeeId: "EMP-101",
        name: "Karan Sharma",
        date: "2026-06-20",
        clockIn: "2026-06-20T09:15:00Z",
        clockOut: "2026-06-20T18:05:00Z",
        duration: "8h 50m"
      },
      "ATT-002": {
        id: "ATT-002",
        employeeId: "EMP-102",
        name: "Aisha Verma",
        date: "2026-06-20",
        clockIn: "2026-06-20T09:30:00Z",
        clockOut: "2026-06-20T17:45:00Z",
        duration: "8h 15m"
      }
    },
    payments: {
      "PAY-1001": {
        id: "PAY-1001",
        customerName: "Acme Corp",
        description: "Q2 Web Design Consultation Fee",
        amount: "45000",
        timestamp: "2026-06-21T10:15:30Z",
        status: "Success"
      }
    },
    active_sessions: {}
  };

  // --- LOCAL STORAGE DATABASE IMPLEMENTATION ---
  class LocalDB {
    constructor() {
      this.listeners = {}; // colName -> Array of callbacks
      this.initDefaultSeeds();
    }

    initDefaultSeeds() {
      // Check if owners exists. If not, seed everything.
      const test = localStorage.getItem(LOCAL_DB_PREFIX + "owners");
      if (!test) {
        console.log("Initializing Local Storage database with Nexure seed data...");
        // Clear any old format seeds
        for (const key of Object.keys(DEFAULT_SEEDS)) {
          localStorage.removeItem(LOCAL_DB_PREFIX + key);
        }
        localStorage.removeItem(LOCAL_DB_PREFIX + "metadata"); // delete old metadata format

        // Write new seeds
        for (const [colName, docs] of Object.entries(DEFAULT_SEEDS)) {
          localStorage.setItem(LOCAL_DB_PREFIX + colName, JSON.stringify(docs));
        }
      }
    }

    readCollection(colName) {
      const dataStr = localStorage.getItem(LOCAL_DB_PREFIX + colName);
      if (!dataStr) return {};
      try {
        return JSON.parse(dataStr);
      } catch (e) {
        return {};
      }
    }

    writeCollection(colName, data) {
      localStorage.setItem(LOCAL_DB_PREFIX + colName, JSON.stringify(data));
      this.triggerListeners(colName);
    }

    readDoc(colName, docId) {
      const col = this.readCollection(colName);
      return col[docId] || null;
    }

    writeDoc(colName, docId, data) {
      const col = this.readCollection(colName);
      const oldDoc = col[docId] || {};
      col[docId] = { ...oldDoc, ...data, id: docId };
      this.writeCollection(colName, col);
    }

    deleteDoc(colName, docId) {
      const col = this.readCollection(colName);
      if (col[docId]) {
        delete col[docId];
        this.writeCollection(colName, col);
      }
    }

    addListener(colName, cb) {
      if (!this.listeners[colName]) {
        this.listeners[colName] = [];
      }
      this.listeners[colName].push(cb);
    }

    removeListener(colName, cb) {
      if (!this.listeners[colName]) return;
      this.listeners[colName] = this.listeners[colName].filter(item => item !== cb);
    }

    triggerListeners(colName) {
      if (this.listeners[colName]) {
        this.listeners[colName].forEach(cb => {
          try {
            cb();
          } catch (err) {
            console.error("Error in DB listener callback:", err);
          }
        });
      }
    }

    resetDatabase() {
      // Clear only nexure db keys
      for (const key of Object.keys(DEFAULT_SEEDS)) {
        localStorage.removeItem(LOCAL_DB_PREFIX + key);
      }
      localStorage.removeItem(LOCAL_DB_PREFIX + "metadata");
      this.initDefaultSeeds();
      // Trigger all listeners
      for (const key of Object.keys(DEFAULT_SEEDS)) {
        this.triggerListeners(key);
      }
    }
  }

  const localDBInstance = new LocalDB();

  // --- FIRESTORE-COMPATIBLE API WRAPPERS ---

  class MockDocSnapshot {
    constructor(id, data) {
      this.id = id;
      this._data = data;
      this.exists = data !== null;
    }
    data() {
      return this._data;
    }
  }

  class MockQuerySnapshot {
    constructor(docs) {
      this.docs = docs;
      this.size = docs.length;
      this.empty = docs.length === 0;
    }
    forEach(callback) {
      this.docs.forEach(callback);
    }
  }

  class MockDocRef {
    constructor(colName, docId) {
      this.colName = colName;
      this.docId = docId;
    }

    async get() {
      const data = localDBInstance.readDoc(this.colName, this.docId);
      return new MockDocSnapshot(this.docId, data);
    }

    async set(data) {
      localDBInstance.writeDoc(this.colName, this.docId, data);
    }

    async update(data) {
      localDBInstance.writeDoc(this.colName, this.docId, data);
    }

    async delete() {
      localDBInstance.deleteDoc(this.colName, this.docId);
    }
  }

  class MockQuery {
    constructor(colName, filters = []) {
      this.colName = colName;
      this.filters = filters;
    }

    where(field, op, value) {
      return new MockQuery(this.colName, [...this.filters, { field, op, value }]);
    }

    async get() {
      const rawCol = localDBInstance.readCollection(this.colName);
      let docsList = Object.values(rawCol);

      // Apply Filters
      for (const filter of this.filters) {
        docsList = docsList.filter(doc => {
          const docVal = doc[filter.field];
          if (filter.op === "==") return docVal === filter.value;
          if (filter.op === "!=") return docVal !== filter.value;
          return true;
        });
      }

      const snapDocs = docsList.map(doc => new MockDocSnapshot(doc.id, doc));
      return new MockQuerySnapshot(snapDocs);
    }

    onSnapshot(callback, errCallback) {
      const updateTrigger = async () => {
        try {
          const snap = await this.get();
          callback(snap);
        } catch (e) {
          if (errCallback) errCallback(e);
          else console.error(e);
        }
      };

      localDBInstance.addListener(this.colName, updateTrigger);
      updateTrigger(); // Initial fire

      return () => {
        localDBInstance.removeListener(this.colName, updateTrigger);
      };
    }
  }

  class MockCollectionRef extends MockQuery {
    constructor(colName) {
      super(colName, []);
    }

    doc(docId) {
      return new MockDocRef(this.colName, docId);
    }
  }

  class MockBatch {
    constructor() {
      this.operations = [];
    }

    delete(docRef) {
      this.operations.push({ type: "delete", colName: docRef.colName, docId: docRef.docId });
    }

    async commit() {
      for (const op of this.operations) {
        if (op.type === "delete") {
          localDBInstance.deleteDoc(op.colName, op.docId);
        }
      }
      this.operations = [];
    }
  }

  class MockFirestore {
    collection(colName) {
      return new MockCollectionRef(colName);
    }

    batch() {
      return new MockBatch();
    }
  }

  // --- INITIALIZATION LOGGER ---
  let activeDb = null;
  let activeDbType = "local";

  function getSavedConfig() {
    const str = localStorage.getItem(DB_CONFIG_KEY);
    if (!str) return null;
    try {
      return JSON.parse(str);
    } catch (e) {
      return null;
    }
  }

  // Exports to the window object
  window.NexureDB = {
    getConfig: getSavedConfig,
    
    saveConfig: function (type, configObj) {
      if (type === "local") {
        localStorage.setItem(DB_CONFIG_KEY, JSON.stringify({ type: "local" }));
      } else {
        localStorage.setItem(DB_CONFIG_KEY, JSON.stringify({ type: type, config: configObj }));
      }
      window.location.reload();
    },

    clearConfig: function () {
      localStorage.removeItem(DB_CONFIG_KEY);
      window.location.reload();
    },

    getDbType: function () {
      return activeDbType;
    },

    resetToFactoryDefaults: function () {
      localDBInstance.resetDatabase();
    }
  };

  // Determine active database interface
  const savedConfig = getSavedConfig();
  if (savedConfig && savedConfig.type === "firebase" && savedConfig.config) {
    const cfg = savedConfig.config;
    // Check if Firebase library is loaded
    if (typeof firebase !== "undefined") {
      try {
        if (!firebase.apps.length) {
          firebase.initializeApp(cfg);
        }
        activeDb = firebase.firestore();
        activeDbType = "firebase";
        console.log("Nexure Studios connected successfully to cloud Firestore.");
      } catch (err) {
        console.error("Failed to initialize Firebase with stored config:", err);
      }
    } else {
      console.warn("Firebase SDK is configured but not loaded. Falling back to local storage.");
    }
  }

  if (!activeDb) {
    activeDb = new MockFirestore();
    activeDbType = "local";
    console.log("Nexure Studios running in Local Storage database mode.");
  }

  // Bind to window.db so existing files work out-of-the-box
  window.db = activeDb;
})();

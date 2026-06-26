import { createClient } from '@supabase/supabase-js';

// Read Supabase credentials from Vite environment variables
const supabaseUrl = import.meta.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Supabase credentials missing! Please configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// --- FIELD MAPPING UTILITIES (camelCase <-> snake_case) ---
const FIELD_MAPPINGS = {
  employees: {
    avatar: 'avatar_url',
    employeeId: 'employee_id',
    isSuspended: 'is_suspended'
  },
  projects: {
    assignedTo: 'assigned_to'
  },
  attendance: {
    employeeId: 'employee_id',
    clockIn: 'clock_in',
    clockOut: 'clock_out'
  },
  active_sessions: {
    employeeId: 'employee_id',
    clockInTime: 'clock_in_time'
  },
  payments: {
    customerName: 'customer_name',
    upiString: 'upi_string'
  }
};

function mapFields(data, mappings, reverse = false) {
  if (!data || typeof data !== 'object') return data;
  const mapped = {};
  for (const [key, val] of Object.entries(data)) {
    let newKey = key;
    if (mappings) {
      if (reverse) {
        // snake_case -> camelCase
        const found = Object.entries(mappings).find(([_, v]) => v === key);
        if (found) newKey = found[0];
      } else {
        // camelCase -> snake_case
        if (mappings[key]) newKey = mappings[key];
      }
    }
    mapped[newKey] = val;
  }
  return mapped;
}

function toPostgres(table, data) {
  return mapFields(data, FIELD_MAPPINGS[table], false);
}

function toJS(table, data) {
  return mapFields(data, FIELD_MAPPINGS[table], true);
}

// --- FIRESTORE-COMPATIBLE API WRAPPERS BACKED BY SUPABASE ---

class DocSnapshot {
  constructor(id, data) {
    this.id = id;
    this._data = data;
    this.exists = data !== null;
  }
  data() {
    return this._data;
  }
}

class QuerySnapshot {
  constructor(docs) {
    this.docs = docs;
    this.size = docs.length;
    this.empty = docs.length === 0;
  }
  forEach(callback) {
    this.docs.forEach(callback);
  }
}

class DocRef {
  constructor(colName, docId) {
    this.colName = colName;
    this.docId = docId;
  }

  async get() {
    try {
      // Map Firestore collection name to Supabase table
      let table = this.colName === 'owners' ? 'employees' : this.colName;
      let pkCol = 'id';
      if (table === 'active_sessions') pkCol = 'employee_id';

      let query = supabase.from(table).select('*');
      
      if (table === 'employees') {
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(this.docId);
        if (isUUID) {
          query = query.eq('id', this.docId);
        } else {
          query = query.eq('employee_id', this.docId);
        }
      } else {
        query = query.eq(pkCol, this.docId);
      }

      const { data, error } = await query.maybeSingle();

      if (error) throw error;
      const jsData = data ? toJS(this.colName, data) : null;
      return new DocSnapshot(this.docId, jsData);
    } catch (err) {
      console.error(`Error fetching doc ${this.colName}/${this.docId}:`, err);
      return new DocSnapshot(this.docId, null);
    }
  }

  async set(data) {
    try {
      let table = this.colName === 'owners' ? 'employees' : this.colName;
      let pkCol = 'id';
      if (table === 'active_sessions') pkCol = 'employee_id';

      const pgData = toPostgres(this.colName, data);
      
      if (table === 'employees') {
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(this.docId);
        if (isUUID) {
          pgData.id = this.docId;
        } else {
          pgData.employee_id = this.docId;
        }
      } else {
        pgData[pkCol] = this.docId;
      }

      const { error } = await supabase
        .from(table)
        .upsert(pgData);

      if (error) throw error;
    } catch (err) {
      console.error(`Error setting doc ${this.colName}/${this.docId}:`, err);
      throw err;
    }
  }

  async update(data) {
    try {
      let table = this.colName === 'owners' ? 'employees' : this.colName;
      let pkCol = 'id';
      if (table === 'active_sessions') pkCol = 'employee_id';

      const pgData = toPostgres(this.colName, data);
      let query = supabase.from(table).update(pgData);

      if (table === 'employees') {
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(this.docId);
        if (isUUID) {
          query = query.eq('id', this.docId);
        } else {
          query = query.eq('employee_id', this.docId);
        }
      } else {
        query = query.eq(pkCol, this.docId);
      }

      const { error } = await query;
      if (error) throw error;
    } catch (err) {
      console.error(`Error updating doc ${this.colName}/${this.docId}:`, err);
      throw err;
    }
  }

  async delete() {
    try {
      let table = this.colName === 'owners' ? 'employees' : this.colName;
      let pkCol = 'id';
      if (table === 'active_sessions') pkCol = 'employee_id';

      let query = supabase.from(table).delete();

      if (table === 'employees') {
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(this.docId);
        if (isUUID) {
          query = query.eq('id', this.docId);
        } else {
          query = query.eq('employee_id', this.docId);
        }
      } else {
        query = query.eq(pkCol, this.docId);
      }

      const { error } = await query;
      if (error) throw error;
    } catch (err) {
      console.error(`Error deleting doc ${this.colName}/${this.docId}:`, err);
      throw err;
    }
  }
}

class Query {
  constructor(colName, filters = []) {
    this.colName = colName;
    this.filters = filters;
  }

  where(field, op, value) {
    return new Query(this.colName, [...this.filters, { field, op, value }]);
  }

  async get() {
    try {
      let table = this.colName === 'owners' ? 'employees' : this.colName;
      let query = supabase.from(table).select('*');

      // Apply default filters for owners and employees
      if (this.colName === 'owners') {
        query = query.eq('role', 'admin');
      } else if (this.colName === 'employees') {
        query = query.eq('role', 'employee');
      }

      // Apply custom filters
      for (const filter of this.filters) {
        const pgField = FIELD_MAPPINGS[table]?.[filter.field] || filter.field;
        if (filter.op === '==') {
          query = query.eq(pgField, filter.value);
        } else if (filter.op === '!=') {
          query = query.neq(pgField, filter.value);
        }
      }

      const { data, error } = await query;
      if (error) throw error;

      const snapDocs = data.map(doc => {
        const jsData = toJS(this.colName, doc);
        // Map document ID correctly (for active_sessions it is employee_id)
        const docId = this.colName === 'active_sessions' ? jsData.employeeId : (jsData.id || doc.id);
        return new DocSnapshot(docId, jsData);
      });

      return new QuerySnapshot(snapDocs);
    } catch (err) {
      console.error(`Error fetching collection query ${this.colName}:`, err);
      return new QuerySnapshot([]);
    }
  }

  onSnapshot(callback, errCallback) {
    let table = this.colName === 'owners' ? 'employees' : this.colName;

    const refetchAndTrigger = async () => {
      try {
        const snap = await this.get();
        callback(snap);
      } catch (err) {
        if (errCallback) errCallback(err);
        else console.error(err);
      }
    };

    // Initial fetch
    refetchAndTrigger();

    // Subscribe to real-time changes
    const channel = supabase
      .channel(`realtime:${this.colName}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: table }, () => {
        refetchAndTrigger();
      })
      .subscribe();

    // Return unsubscribe function
    return () => {
      supabase.removeChannel(channel);
    };
  }
}

class CollectionRef extends Query {
  constructor(colName) {
    super(colName, []);
  }

  doc(docId) {
    return new DocRef(this.colName, docId);
  }
}

class Batch {
  constructor() {
    this.operations = [];
  }

  delete(docRef) {
    this.operations.push({ type: 'delete', ref: docRef });
  }

  async commit() {
    for (const op of this.operations) {
      if (op.type === 'delete') {
        await op.ref.delete();
      }
    }
    this.operations = [];
  }
}

class FirestoreWrapper {
  collection(colName) {
    return new CollectionRef(colName);
  }

  batch() {
    return new Batch();
  }
}

// Bind to window objects for inline scripts in HTML files
window.supabase = supabase;
window.db = new FirestoreWrapper();

console.log("Supabase and Firestore-compat database adapter initialized.");

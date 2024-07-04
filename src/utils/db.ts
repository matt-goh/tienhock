// src/utils/db.ts
import { openDB } from 'idb';

const dbPromise = openDB('payroll-db', 1, {
  upgrade(db) {
    db.createObjectStore('employees', { keyPath: 'id', autoIncrement: true });
  },
});

export const addEmployee = async (employee: any) => {
  const db = await dbPromise;
  await db.add('employees', employee);
};

export const getEmployees = async () => {
  const db = await dbPromise;
  return await db.getAll('employees');
};

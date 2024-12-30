// src/routes/entity-router-factory.js
import { Router } from 'express';

export default function createEntityRouter(pool, entityName, tableName) {
  const router = Router();
  const capitalizedEntity = entityName.charAt(0).toUpperCase() + entityName.slice(1);

  // Create a new entity
  router.post('/', async (req, res) => {
    const { id, name } = req.body;

    try {
      const query = `
        INSERT INTO ${tableName} (id, name)
        VALUES ($1, $2)
        RETURNING *
      `;
      
      const values = [id, name];

      const result = await pool.query(query, values);
      res.status(201).json({ 
        message: `${capitalizedEntity} created successfully`, 
        [entityName]: result.rows[0] 
      });
    } catch (error) {
      if (error.code === '23505') { // unique_violation error code
        return res.status(400).json({ message: `A ${entityName} with this ID already exists` });
      }
      console.error(`Error inserting ${entityName}:`, error);
      res.status(500).json({ message: `Error creating ${entityName}`, error: error.message });
    }
  });

  // Get all entities
  router.get('/', async (req, res) => {
    try {
      const query = `SELECT * FROM ${tableName}`;
      const result = await pool.query(query);
      res.json(result.rows);
    } catch (error) {
      console.error(`Error fetching ${entityName}s:`, error);
      res.status(500).json({ message: `Error fetching ${entityName}s`, error: error.message });
    }
  });

  // Delete entities (batch delete)
  router.delete('/', async (req, res) => {
    const entityIds = req.body[`${entityName}s`];

    if (!Array.isArray(entityIds) || entityIds.length === 0) {
      return res.status(400).json({ message: `Invalid ${entityName} IDs provided` });
    }

    try {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Delete the entities
        const deleteQuery = `DELETE FROM ${tableName} WHERE id = ANY($1::text[]) RETURNING id`;
        const result = await client.query(deleteQuery, [entityIds]);

        await client.query('COMMIT');

        const deletedIds = result.rows.map(row => row.id);
        res.status(200).json({ 
          message: `${capitalizedEntity}s deleted successfully`, 
          [`deleted${capitalizedEntity}s`]: deletedIds 
        });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error(`Error deleting ${entityName}s:`, error);
      res.status(500).json({ message: `Error deleting ${entityName}s`, error: error.message });
    }
  });

  // Batch update/insert entities
  router.post('/batch', async (req, res) => {
    const entities = req.body[`${entityName}s`];

    try {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const processedEntities = [];

        // Process all entities
        for (const entity of entities) {
          const { id, newId, name } = entity;
          
          if (newId && newId !== id) {
            // This is an existing entity with an ID change
            const upsertQuery = `
              INSERT INTO ${tableName} (id, name)
              VALUES ($1, $2)
              ON CONFLICT (id) DO UPDATE
              SET name = EXCLUDED.name
              RETURNING *
            `;
            const upsertValues = [newId, name];
            const upsertResult = await client.query(upsertQuery, upsertValues);
            
            // Delete the old entity
            await client.query(`DELETE FROM ${tableName} WHERE id = $1`, [id]);
            
            processedEntities.push(upsertResult.rows[0]);
          } else {
            // This is an existing entity without ID change or a new entity
            const upsertQuery = `
              INSERT INTO ${tableName} (id, name)
              VALUES ($1, $2)
              ON CONFLICT (id) DO UPDATE
              SET name = EXCLUDED.name
              RETURNING *
            `;
            const upsertValues = [id, name];
            const result = await client.query(upsertQuery, upsertValues);
            processedEntities.push(result.rows[0]);
          }
        }

        await client.query('COMMIT');
        res.json({ 
          message: `${capitalizedEntity}s processed successfully`, 
          [`${entityName}s`]: processedEntities
        });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error(`Error processing ${entityName}s:`, error);
      res.status(500).json({ message: `Error processing ${entityName}s`, error: error.message });
    }
  });

  return router;
}
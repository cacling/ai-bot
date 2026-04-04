import { Client, Connection } from '@temporalio/client';
import { TEMPORAL } from './config.js';

let client: Client | null = null;

export async function getTemporalClient(): Promise<Client> {
  if (client) return client;
  const connection = await Connection.connect({
    address: TEMPORAL.address,
  });
  client = new Client({ connection, namespace: TEMPORAL.namespace });
  return client;
}

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';
import { migrateDatabase } from '../migrate.ts';

declare module 'vitest' {
  export interface ProvidedContext {
    /** Owner connection: fixtures, schema inspection. */
    ownerUrl: string;
    /** `rowlens_app` connection: what the app uses. */
    appUrl: string;
  }
}

const APP_PASSWORD = 'test_app_password_only';
let container: StartedPostgreSqlContainer | undefined;

/** One Postgres 16 for the whole `db` project, migrated exactly like production. */
export async function setup(project: TestProject): Promise<void> {
  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('rowlens')
    .withUsername('rowlens_owner')
    .withPassword('test_owner_password')
    .start();
  const ownerUrl = container.getConnectionUri();
  await migrateDatabase({ ownerUrl, appPassword: APP_PASSWORD });

  const app = new URL(ownerUrl);
  app.username = 'rowlens_app';
  app.password = APP_PASSWORD;
  project.provide('ownerUrl', ownerUrl);
  project.provide('appUrl', app.toString());
}

export async function teardown(): Promise<void> {
  await container?.stop();
}

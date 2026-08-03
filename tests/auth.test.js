'use strict';

/**
 * Tests de integración REALES para la migración de auth (bcrypt +
 * unique username) — pega directo contra Postgres local, no mockea
 * Sequelize. Requiere las mismas variables de entorno que holdem.js
 * (ver .env / README.md): DB_DIALECT, DB_USER, DB_HOST, DB_DATABASE,
 * DB_PASSWORD, DB_PORT.
 *
 * Ejecutar con:
 *   node --test tests/auth.test.js
 *
 * Cada test usa un username único (timestamp + random) para no pisarse
 * entre corridas ni depender de que la tabla esté vacía.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const sequelizeObjects = require('../src/database/sequelize');
const dbUtils = require('../src/database/dbUtils');

function uniqueUsername(prefix) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

test('CreateAccountPromise — registra un usuario nuevo y guarda un hash bcrypt, no el texto plano', async () => {
  const username = uniqueUsername('create');
  const plainPassword = 'MiPasswordSegura123';

  const result = await dbUtils.CreateAccountPromise(sequelizeObjects, username, plainPassword, `${username}@test.local`);
  assert.strictEqual(result.result, true, 'la creación debería resultar exitosa');

  const rows = await sequelizeObjects.User.findAll({where: {name: username}});
  assert.strictEqual(rows.length, 1, 'debería existir exactamente un usuario con ese nombre');
  const stored = rows[0].password;
  assert.notStrictEqual(stored, plainPassword, 'la contraseña NUNCA debe quedar guardada en texto plano');
  assert.match(stored, /^\$2[aby]?\$/, 'la contraseña guardada debe tener firma de hash bcrypt ($2...)');
});

test('CreateAccountPromise — falla al registrar un username duplicado', async () => {
  const username = uniqueUsername('dup');
  const first = await dbUtils.CreateAccountPromise(sequelizeObjects, username, 'Pass1', `${username}@test.local`);
  assert.strictEqual(first.result, true, 'el primer registro debería funcionar');

  const second = await dbUtils.CreateAccountPromise(sequelizeObjects, username, 'Pass2', `${username}2@test.local`);
  assert.strictEqual(second.result, false, 'el segundo registro con el mismo username debe rechazarse');

  const rows = await sequelizeObjects.User.findAll({where: {name: username}});
  assert.strictEqual(rows.length, 1, 'debe seguir existiendo un único usuario, no dos');
});

test('LoginPromise — login exitoso de un usuario recién creado (ya en formato bcrypt)', async () => {
  const username = uniqueUsername('login');
  const plainPassword = 'OtraPasswordSegura456';
  await dbUtils.CreateAccountPromise(sequelizeObjects, username, plainPassword, `${username}@test.local`);

  const loginOk = await dbUtils.LoginPromise(sequelizeObjects, username, plainPassword);
  assert.strictEqual(loginOk.result, true, 'login con la contraseña correcta debe aceptarse');
  assert.strictEqual(loginOk.username, username);

  const loginBad = await dbUtils.LoginPromise(sequelizeObjects, username, 'contraseña incorrecta');
  assert.strictEqual(loginBad.result, false, 'login con contraseña incorrecta debe rechazarse');
});

test('LoginPromise — migra en silencio una cuenta legacy en texto plano al primer login', async () => {
  const username = uniqueUsername('legacy');
  const plainPassword = 'PasswordViejaEnTextoPlano';

  // Se inserta directo por Sequelize, salteando CreateAccountPromise a
  // propósito — así queda guardada en texto plano, simulando una cuenta
  // creada ANTES de esta migración.
  await sequelizeObjects.User.create({
    name: username,
    password: plainPassword,
    email: `${username}@test.local`,
    money: 10000,
  });

  const beforeRows = await sequelizeObjects.User.findAll({where: {name: username}});
  assert.strictEqual(beforeRows[0].password, plainPassword, 'precondición: debe estar en texto plano antes del login');

  const loginResult = await dbUtils.LoginPromise(sequelizeObjects, username, plainPassword);
  assert.strictEqual(loginResult.result, true, 'el login legacy con la contraseña correcta en texto plano debe aceptarse');

  const afterRows = await sequelizeObjects.User.findAll({where: {name: username}});
  const migratedPassword = afterRows[0].password;
  assert.notStrictEqual(migratedPassword, plainPassword, 'después del login, la DB ya NO debe tener el texto plano');
  assert.match(migratedPassword, /^\$2[aby]?\$/, 'después del login, la DB debe tener un hash bcrypt');

  // Y un segundo login (ya migrado) debe seguir funcionando, tomando ahora
  // la rama bcrypt en vez de la de texto plano.
  const secondLogin = await dbUtils.LoginPromise(sequelizeObjects, username, plainPassword);
  assert.strictEqual(secondLogin.result, true, 'el login post-migración debe seguir aceptando la misma contraseña');
});

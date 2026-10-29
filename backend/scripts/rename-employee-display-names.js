import { createDatabaseClient } from '../src/config/database.js';

const apply = process.argv.includes('--apply');
const database = createDatabaseClient();
const primaryEmails = new Set(['employee@ewa.bh', 'empoloyee@ewa.bh']);
const names = [
  ['Ahmed', 'Al Khalifa'],
  ['Fatima', 'Al Zayani'],
  ['Mohammed', 'Al Ansari'],
  ['Noor', 'Al Doseri'],
  ['Yousef', 'Al Mahmood'],
  ['Maryam', 'Al Sayed'],
  ['Hassan', 'Al Arrayed'],
  ['Layla', 'Al Jalahma'],
  ['Omar', 'Al Shaikh'],
  ['Zainab', 'Al Noaimi'],
  ['Ali', 'Al Haddad'],
  ['Sara', 'Al Balooshi'],
  ['Abdullah', 'Al Mannai'],
  ['Huda', 'Al Kooheji'],
  ['Khalid', 'Al Rumaihi'],
  ['Aisha', 'Al Musallam'],
  ['Nasser', 'Al Thawadi'],
  ['Maha', 'Al Fardan'],
  ['Salman', 'Al Madani'],
  ['Reem', 'Al Qattan'],
];

try {
  const employees = await database.user.findMany({
    where: { email: { endsWith: '@ewa.bh', mode: 'insensitive' }, role: { name: 'EMPLOYEE' } },
    select: { id: true, email: true, firstName: true, lastName: true },
    orderBy: [{ email: 'asc' }, { id: 'asc' }],
  });
  const primary = employees.filter((user) => primaryEmails.has(user.email.toLowerCase()));
  const remaining = employees.filter((user) => !primaryEmails.has(user.email.toLowerCase()));
  if (primary.length !== 1) throw new Error(`Expected one employee@ewa.bh account, found ${primary.length}.`);
  if (remaining.length > names.length) throw new Error(`Add more Arabic names before updating ${remaining.length} remaining accounts.`);
  const changes = [
    { ...primary[0], nextFirstName: 'Akram', nextLastName: 'Aldahyani' },
    ...remaining.map((user, index) => ({ ...user, nextFirstName: names[index][0], nextLastName: names[index][1] })),
  ];
  if (apply) await database.$transaction(changes.map((user) => database.user.update({
    where: { id: user.id }, data: { firstName: user.nextFirstName, lastName: user.nextLastName },
  })));
  console.table(changes.map((user) => ({ email: user.email, previous: `${user.firstName} ${user.lastName}`,
    next: `${user.nextFirstName} ${user.nextLastName}`, applied: apply })));
} finally {
  await database.$disconnect();
}

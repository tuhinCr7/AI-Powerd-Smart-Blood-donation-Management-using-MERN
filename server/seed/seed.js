/**
 * Seeds a demo dataset: one admin, a donor pool spread across Dhaka, a handful
 * of patients with open requests, plus donation history so the recommender and
 * the admin charts have something real to chew on.
 *
 *   npm run seed          # wipes and reseeds
 */
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import { User } from '../src/models/User.js';
import { BloodRequest } from '../src/models/BloodRequest.js';
import { Donation } from '../src/models/Donation.js';
import { Conversation } from '../src/models/Conversation.js';
import { Message } from '../src/models/Message.js';
import { BLOOD_GROUPS, ROLES, URGENCY } from '../src/utils/constants.js';

const DEMO_PASSWORD = 'Password123';

// Neighbourhood centres around Dhaka — donors are scattered near these.
const AREAS = [
  { city: 'Dhaka', district: 'Dhanmondi', coords: [90.3742, 23.7461] },
  { city: 'Dhaka', district: 'Gulshan', coords: [90.4152, 23.7925] },
  { city: 'Dhaka', district: 'Mirpur', coords: [90.3654, 23.8223] },
  { city: 'Dhaka', district: 'Uttara', coords: [90.3983, 23.8759] },
  { city: 'Dhaka', district: 'Motijheel', coords: [90.4172, 23.7330] },
  { city: 'Dhaka', district: 'Mohammadpur', coords: [90.3589, 23.7639] },
  { city: 'Chattogram', district: 'Agrabad', coords: [91.8123, 22.3269] },
  { city: 'Sylhet', district: 'Zindabazar', coords: [91.8687, 24.8949] },
];

const FIRST = ['Tuhin', 'Nazmul', 'Ayesha', 'Rakib', 'Sadia', 'Imran', 'Farhana', 'Shuvo', 'Mitu', 'Arif', 'Nusrat', 'Tanvir', 'Rima', 'Sabbir', 'Jarin', 'Hasan', 'Priya', 'Rafi', 'Mim', 'Sohel', 'Tasnim', 'Nayeem', 'Lamia', 'Fahim'];
const LAST = ['Alam', 'Rahman', 'Hossain', 'Islam', 'Chowdhury', 'Ahmed', 'Karim', 'Sultana', 'Siddique', 'Mahmud', 'Bhuiyan', 'Haque'];
const HOSPITALS = ['Square Hospital', 'Dhaka Medical College Hospital', 'Evercare Hospital', 'United Hospital', 'Ibn Sina', 'Popular Diagnostic Centre'];

const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const daysAgo = (n) => new Date(Date.now() - n * 86400000);

/** Random point within ~`km` of a centre, so donors do not stack on one pin. */
const jitter = ([lng, lat], km = 4) => {
  const dLat = (Math.random() - 0.5) * (km / 111);
  const dLng = (Math.random() - 0.5) * (km / (111 * Math.cos((lat * Math.PI) / 180)));
  return [Number((lng + dLng).toFixed(6)), Number((lat + dLat).toFixed(6))];
};

async function seed() {
  await connectDB();

  console.log('[seed] clearing collections…');
  await Promise.all([
    User.deleteMany({}),
    BloodRequest.deleteMany({}),
    Donation.deleteMany({}),
    Conversation.deleteMany({}),
    Message.deleteMany({}),
  ]);

  // --- admin ---------------------------------------------------------------
  const admin = await User.create({
    name: 'System Administrator',
    email: 'admin@lifelink.io',
    password: DEMO_PASSWORD,
    phone: '+8801700000000',
    role: ROLES.ADMIN,
    bloodGroup: 'O+',
    address: { city: 'Dhaka', district: 'Motijheel' },
    isVerified: true,
  });

  // --- donors --------------------------------------------------------------
  console.log('[seed] creating donors…');
  const donors = [];
  for (let i = 0; i < 60; i += 1) {
    const area = rand(AREAS);
    const lastDonation = Math.random() < 0.7 ? daysAgo(randInt(30, 400)) : null;
    const received = randInt(0, 14);

    // eslint-disable-next-line no-await-in-loop
    const donor = await User.create({
      name: `${rand(FIRST)} ${rand(LAST)}`,
      email: `donor${i + 1}@lifelink.io`,
      password: DEMO_PASSWORD,
      phone: `+88017${randInt(10000000, 99999999)}`,
      role: ROLES.DONOR,
      bloodGroup: rand(BLOOD_GROUPS),
      address: { line: `House ${randInt(1, 99)}, Road ${randInt(1, 30)}`, city: area.city, district: area.district },
      location: { type: 'Point', coordinates: jitter(area.coords) },
      isVerified: Math.random() < 0.75,
      lastSeenAt: daysAgo(randInt(0, 20)),
      donorProfile: {
        isAvailable: Math.random() < 0.8,
        lastDonationDate: lastDonation,
        totalDonations: lastDonation ? randInt(1, 12) : 0,
        weightKg: randInt(50, 95),
        dateOfBirth: daysAgo(randInt(19, 55) * 365),
        hasChronicIllness: Math.random() < 0.08,
        requestsReceived: received,
        requestsAccepted: randInt(0, received),
        avgResponseMinutes: Math.random() < 0.8 ? randInt(4, 240) : null,
        preferredRadiusKm: rand([10, 15, 25, 40]),
      },
    });
    donors.push(donor);
  }

  // --- patients ------------------------------------------------------------
  console.log('[seed] creating patients…');
  const patients = [];
  for (let i = 0; i < 10; i += 1) {
    const area = rand(AREAS);
    // eslint-disable-next-line no-await-in-loop
    const patient = await User.create({
      name: `${rand(FIRST)} ${rand(LAST)}`,
      email: `patient${i + 1}@lifelink.io`,
      password: DEMO_PASSWORD,
      phone: `+88018${randInt(10000000, 99999999)}`,
      role: ROLES.PATIENT,
      bloodGroup: rand(BLOOD_GROUPS),
      address: { line: `Ward ${randInt(1, 12)}`, city: area.city, district: area.district },
      location: { type: 'Point', coordinates: jitter(area.coords, 2) },
      isVerified: true,
      lastSeenAt: daysAgo(randInt(0, 5)),
      patientProfile: {
        hospitalName: rand(HOSPITALS),
        condition: rand(['Thalassemia', 'Post-surgical recovery', 'Anaemia', 'Accident trauma', 'Dengue']),
      },
    });
    patients.push(patient);
  }

  // A stable demo account so the README credentials always work.
  const demoPatient = patients[0];
  demoPatient.email = 'patient@lifelink.io';
  demoPatient.name = 'Demo Patient';
  demoPatient.bloodGroup = 'A+';
  demoPatient.address = { city: 'Dhaka', district: 'Dhanmondi' };
  demoPatient.location = { type: 'Point', coordinates: [90.3742, 23.7461] };
  await demoPatient.save({ validateBeforeSave: false });

  const demoDonor = donors[0];
  demoDonor.email = 'donor@lifelink.io';
  demoDonor.name = 'Demo Donor';
  demoDonor.bloodGroup = 'A+';
  demoDonor.isVerified = true;
  demoDonor.donorProfile.isAvailable = true;
  demoDonor.donorProfile.lastDonationDate = daysAgo(140);
  demoDonor.address = { city: 'Dhaka', district: 'Dhanmondi' };
  demoDonor.location = { type: 'Point', coordinates: [90.3760, 23.7480] };
  await demoDonor.save({ validateBeforeSave: false });

  // --- requests ------------------------------------------------------------
  console.log('[seed] creating blood requests…');
  const requests = [];
  for (let i = 0; i < 24; i += 1) {
    const patient = rand(patients);
    const createdAt = daysAgo(randInt(0, 45));
    const status = rand(['open', 'open', 'matched', 'fulfilled', 'fulfilled', 'cancelled']);
    // eslint-disable-next-line no-await-in-loop
    const request = await BloodRequest.create({
      patient: patient._id,
      bloodGroup: patient.bloodGroup,
      unitsNeeded: randInt(1, 4),
      unitsFulfilled: status === 'fulfilled' ? randInt(1, 4) : 0,
      urgency: rand(Object.values(URGENCY)),
      neededBy: daysAgo(-randInt(1, 10)),
      hospitalName: patient.patientProfile?.hospitalName || rand(HOSPITALS),
      note: 'Please contact as soon as possible. Blood bank slot is reserved.',
      address: patient.address,
      location: patient.location,
      status,
      createdAt,
      updatedAt: createdAt,
    });
    requests.push(request);
  }

  // One guaranteed open critical request for the demo patient.
  await BloodRequest.create({
    patient: demoPatient._id,
    bloodGroup: 'A+',
    unitsNeeded: 2,
    urgency: URGENCY.CRITICAL,
    neededBy: daysAgo(-2),
    hospitalName: 'Square Hospital',
    note: 'Surgery scheduled for tomorrow morning — 2 units needed.',
    address: demoPatient.address,
    location: demoPatient.location,
    status: 'open',
  });

  // --- donation history ----------------------------------------------------
  console.log('[seed] creating donation history…');
  const donations = [];
  for (let i = 0; i < 90; i += 1) {
    const donor = rand(donors);
    donations.push({
      donor: donor._id,
      patient: rand(patients)._id,
      bloodGroup: donor.bloodGroup,
      units: randInt(1, 2),
      donatedAt: daysAgo(randInt(0, 180)),
      hospitalName: rand(HOSPITALS),
      city: donor.address.city,
      verifiedBy: admin._id,
    });
  }
  await Donation.insertMany(donations);

  // --- a seeded chat thread ------------------------------------------------
  const conversation = await Conversation.findOrCreate(demoPatient._id, demoDonor._id);
  const thread = [
    { sender: demoPatient._id, body: 'Hi! I found you through the AI match list — I need 2 units of A+ at Square Hospital.' },
    { sender: demoDonor._id, body: 'Hello! I am available. When do you need it?' },
    { sender: demoPatient._id, body: 'Tomorrow morning if possible. The blood bank slot is booked for 9am.' },
    { sender: demoDonor._id, body: 'That works for me. I will be there by 8:45.' },
  ];
  for (const [i, m] of thread.entries()) {
    // eslint-disable-next-line no-await-in-loop
    await Message.create({
      conversation: conversation._id,
      sender: m.sender,
      body: m.body,
      readBy: [m.sender],
      createdAt: new Date(Date.now() - (thread.length - i) * 600000),
    });
  }
  conversation.lastMessage = {
    body: thread.at(-1).body,
    sender: thread.at(-1).sender,
    sentAt: new Date(),
  };
  conversation.unread.set(String(demoPatient._id), 1);
  await conversation.save();

  console.log(`
[seed] done
  admin    admin@lifelink.io    / ${DEMO_PASSWORD}
  patient  patient@lifelink.io  / ${DEMO_PASSWORD}
  donor    donor@lifelink.io    / ${DEMO_PASSWORD}

  ${donors.length} donors · ${patients.length} patients · ${requests.length + 1} requests · ${donations.length} donations
`);

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch(async (err) => {
  console.error('[seed] failed', err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});

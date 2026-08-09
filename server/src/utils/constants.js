export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export const ROLES = {
  DONOR: 'donor',
  PATIENT: 'patient',
  ADMIN: 'admin',
};

export const REQUEST_STATUS = {
  OPEN: 'open',
  MATCHED: 'matched',
  FULFILLED: 'fulfilled',
  CANCELLED: 'cancelled',
};

export const URGENCY = {
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
  CRITICAL: 'critical',
};

/**
 * Red-cell compatibility: for each recipient group, the donor groups that can give.
 */
export const COMPATIBLE_DONORS = {
  'O-': ['O-'],
  'O+': ['O-', 'O+'],
  'A-': ['O-', 'A-'],
  'A+': ['O-', 'O+', 'A-', 'A+'],
  'B-': ['O-', 'B-'],
  'B+': ['O-', 'O+', 'B-', 'B+'],
  'AB-': ['O-', 'A-', 'B-', 'AB-'],
  'AB+': ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'],
};

/** The reverse map: which recipients a given donor group can serve. */
export const COMPATIBLE_RECIPIENTS = Object.entries(COMPATIBLE_DONORS).reduce(
  (acc, [recipient, donors]) => {
    donors.forEach((donor) => {
      acc[donor] = acc[donor] || [];
      acc[donor].push(recipient);
    });
    return acc;
  },
  {}
);

export function canDonate(donorGroup, recipientGroup) {
  return (COMPATIBLE_DONORS[recipientGroup] || []).includes(donorGroup);
}

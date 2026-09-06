import type { Person } from '../api/types';
import { authorColor, initials } from '../lib/colors';

export function Avatar({ person, size = 22 }: { person: Person; size?: number }) {
  const style = { width: size, height: size, background: authorColor(person.id) };
  if (person.photoUrl) {
    return (
      <img
        className="avatar"
        style={style}
        src={person.photoUrl}
        alt={person.firstName}
        title={person.firstName}
      />
    );
  }
  return (
    <span className="avatar" style={style} title={person.firstName}>
      {initials(person.firstName, person.lastName)}
    </span>
  );
}

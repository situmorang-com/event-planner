import { describe, expect, it } from 'vitest';
import {
	companyKey,
	greetingName,
	linkedinMessageUrl,
	linkedinProfile,
	nameFromLinkedin,
	nameKey
} from './invitations';

describe('matching keys', () => {
	it('ignores titles, degrees, case and accents in names', () => {
		expect(nameKey('Bapak Hendra Gunawan')).toBe('hendra gunawan');
		expect(nameKey("Dato' Dr. Ahmad Faiz, S.Kom.")).toBe('ahmad faiz');
		expect(nameKey('ROSA NÚÑEZ')).toBe('rosa nunez');
		expect(nameKey('Pak')).toBe('pak');
	});

	it('ignores legal forms and punctuation in company names', () => {
		expect(companyKey('PT. Batavia Foods Tbk')).toBe('batavia foods');
		expect(companyKey('Selat Energy Sdn. Bhd.')).toBe('selat energy');
		expect(companyKey('PT')).toBe('pt');
		expect(companyKey('')).toBe('');
	});

	it('greets people the way the list names them', () => {
		expect(greetingName('Rina Wijaya')).toBe('Rina');
		expect(greetingName('Bapak Hendra Gunawan')).toBe('Bapak Hendra');
		expect(greetingName('Budi, S.Kom.')).toBe('Budi');
	});
});

describe('LinkedIn links', () => {
	it('recognises a profile link however it was copied', () => {
		const url = 'https://www.linkedin.com/in/rina-wijaya-4a1b2c';
		expect(linkedinProfile('linkedin.com/in/Rina-Wijaya-4a1b2c')).toBe(url);
		expect(linkedinProfile('https://id.linkedin.com/in/rina-wijaya-4a1b2c/?utm_source=share')).toBe(
			url
		);
		expect(linkedinProfile(' http://linkedin.com/in/rina-wijaya-4a1b2c#about ')).toBe(url);
		expect(linkedinProfile('https://www.linkedin.com/company/srkk')).toBeNull();
		expect(linkedinProfile('Rina Wijaya')).toBeNull();
	});

	it('addresses a new LinkedIn message to the profile owner', () => {
		const compose = 'https://www.linkedin.com/messaging/compose/?recipient=rina-wijaya-4a1b2c';
		expect(linkedinMessageUrl('https://www.linkedin.com/in/rina-wijaya-4a1b2c')).toBe(compose);
		expect(linkedinMessageUrl('https://id.linkedin.com/in/Rina-Wijaya-4a1b2c/?utm=x')).toBe(
			compose
		);
		expect(linkedinMessageUrl('https://www.linkedin.com/in/andr%C3%A9-tan')).toBe(
			'https://www.linkedin.com/messaging/compose/?recipient=andr%C3%A9-tan'
		);
		expect(linkedinMessageUrl('https://www.linkedin.com/company/srkk')).toBeNull();
	});

	it('reads a name from the link only when the link spells one out', () => {
		expect(nameFromLinkedin('https://www.linkedin.com/in/rina-wijaya-4a1b2c')).toBe('Rina Wijaya');
		expect(nameFromLinkedin('https://www.linkedin.com/in/andi-pratama')).toBe('Andi Pratama');
		expect(nameFromLinkedin('https://www.linkedin.com/in/mei-ling-chong-12345678')).toBe(
			'Mei Ling Chong'
		);
		expect(nameFromLinkedin('https://www.linkedin.com/in/rinaw88')).toBeNull();
		expect(nameFromLinkedin('https://www.linkedin.com/in/budi')).toBeNull();
	});
});

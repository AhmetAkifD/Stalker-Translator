// Per-game accent colours. Full class names are listed so Tailwind keeps them in the build.
export const ACCENTS = {
  blue: {
    solid: 'bg-blue-600 text-white',
    soft: 'bg-blue-50 text-blue-700',
    icon: 'text-blue-600',
    iconBg: 'bg-blue-100',
    ring: 'focus:ring-blue-500',
    link: 'text-blue-700',
  },
  red: {
    solid: 'bg-red-700 text-white',
    soft: 'bg-red-50 text-red-700',
    icon: 'text-red-700',
    iconBg: 'bg-red-100',
    ring: 'focus:ring-red-500',
    link: 'text-red-700',
  },
};

export const accentOf = (name) => ACCENTS[name] || ACCENTS.blue;

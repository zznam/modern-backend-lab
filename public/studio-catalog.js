/* Reuse the lab's teaching material; references never imply verified proficiency. */
const STUDIO_TOPICS = Object.fromEntries([...new Set([...Object.keys(TOPIC_GUIDES), ...Object.keys(ADVANCED_TOPICS)])].map(key => {
  const guide = TOPIC_GUIDES[key], advanced = ADVANCED_TOPICS[key];
  const title = advanced?.title || key.split('-').map(word => word[0].toUpperCase() + word.slice(1)).join(' ');
  return [key, { title, level: advanced ? 'advanced' : guide[0], objective: advanced?.objective || guide[2], mechanics: guide?.[3] || advanced?.desc, production: guide?.[4] || advanced?.challenge, prerequisites: advanced?.prerequisites || guide?.[1] || [], reference: advanced?.reference }];
}));

export const isStructuralQuestion = (prompt) => (
    /\b(?:cu[aá]ntos?|qu[eé]|lista|listar|enumera|estructura|contenidos?|temario|manuales?|libros?|horas?|duraci[oó]n|unidades?\s+formativas?|m[oó]dulos?)\b/i.test(prompt)
    && /\b(?:m[oó]dulos?|unidades?\s+formativas?|manuales?|libros?|curso|contenidos?|temario|estructura|horas?|duraci[oó]n)\b/i.test(prompt)
);

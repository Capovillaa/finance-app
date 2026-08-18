import type { ValidationKey } from './messages.js';

/**
 * The wording behind every `ValidationKey`, in all three shipped languages.
 *
 * These live here rather than in `apps/web/src/i18n/locales` and
 * `apps/api/src/i18n/locales` because both sides now reject a field with the
 * same key, and a sentence kept in two catalogues is a sentence that gets
 * corrected in one of them. Each i18n layer merges this block into its own
 * catalogue at init; everything else in those catalogues stays where it is,
 * since nothing else is shared.
 *
 * `Record<ValidationLocale, Record<ValidationMessageName, string>>` is the point
 * of the exercise: a new key does not compile until all three languages have it.
 * The old shell check for key parity could only find that out after the fact,
 * and only for the client.
 */

export const VALIDATION_LOCALES = ['en', 'pt-BR', 'es'] as const;
export type ValidationLocale = (typeof VALIDATION_LOCALES)[number];

/** `validation.nameRequired` -> `nameRequired`: the leaf under the namespace. */
export type ValidationMessageName = ValidationKey extends `validation.${infer Name}` ? Name : never;

/** The i18next namespace every key above sits under. */
export const VALIDATION_NAMESPACE = 'validation';

export const VALIDATION_MESSAGES: Record<ValidationLocale, Record<ValidationMessageName, string>> = {
  en: {
    required: 'Required',
    nameRequired: 'Name is required',
    descriptionRequired: 'Description is required',
    dateRequired: 'Date is required',
    dateInvalid: 'Enter a valid date',
    dateRangeOrder: 'The start date must be on or before the end date',
    startDateRequired: 'Start date is required',
    endDateRequired: 'End date is required for a custom period',
    monthRequired: 'Choose a month',
    weekdayRequired: 'Choose at least one day of the week',
    dayOfMonth: 'Enter a day between {{min}} and {{max}}',
    intervalRequired: 'Enter the number of days between occurrences',
    intervalRange: 'Enter a number of days between {{min}} and {{max}}',
    occurrenceLimitRange: 'Enter a number of occurrences between {{min}} and {{max}}',
    leadTimeRange: 'Enter a whole number of days between {{min}} and {{max}}',
    amountRequired: 'Amount is required',
    amountPositive: 'Enter an amount greater than zero',
    decimalAmount: 'Enter a decimal amount with up to {{decimals}} decimal places',
    currencyCode: 'Use a 3-letter currency code',
    percentRange: 'Enter {{min}}–{{max}}',
    priorityRange: 'Choose {{min}}–{{max}}',
    categoryRequired: 'Choose a category',
    accountRequired: 'Choose an account',
    fromAccountRequired: 'Choose where the money leaves from',
    toAccountRequired: 'Choose where the money arrives',
    differentAccounts: 'Pick two different accounts',
    atLeastOneLine: 'Add at least one category line',
    maxBudgetLines: 'At most {{max}} category lines',
    maxTags: 'At most {{max}} tags',
    emailRequired: 'Email is required',
    emailInvalid: 'Enter a valid email address',
    urlInvalid: 'Enter a valid URL',
    urlProtocol: 'Must be a secure link (https://)',
    uuidInvalid: 'Must be a valid identifier',
    uuidList: 'Must be a comma-separated list of identifiers',
    passwordRequired: 'Password is required',
    passwordLength: 'Password must be at least {{min}} characters',
    passwordComplexity: 'Password must contain both letters and numbers',
    passwordsDiffer: 'Passwords do not match',
    confirmPassword: 'Confirm your password',
    confirmNewPassword: 'Confirm your new password',
    currentPasswordRequired: 'Enter your current password',
    languageRequired: 'Choose a language',
  },
  'pt-BR': {
    required: 'Obrigatório',
    nameRequired: 'O nome é obrigatório',
    descriptionRequired: 'A descrição é obrigatória',
    dateRequired: 'A data é obrigatória',
    dateInvalid: 'Informe uma data válida',
    dateRangeOrder: 'A data inicial precisa ser igual ou anterior à data final',
    startDateRequired: 'A data inicial é obrigatória',
    endDateRequired: 'A data final é obrigatória em um período personalizado',
    monthRequired: 'Escolha um mês',
    weekdayRequired: 'Escolha pelo menos um dia da semana',
    dayOfMonth: 'Informe um dia entre {{min}} e {{max}}',
    intervalRequired: 'Informe o intervalo em dias entre as ocorrências',
    intervalRange: 'Informe um intervalo de {{min}} a {{max}} dias',
    occurrenceLimitRange: 'Informe um número de ocorrências de {{min}} a {{max}}',
    leadTimeRange: 'Informe um número inteiro de dias, de {{min}} a {{max}}',
    amountRequired: 'O valor é obrigatório',
    amountPositive: 'Informe um valor maior que zero',
    decimalAmount: 'Informe um valor decimal com até {{decimals}} casas',
    currencyCode: 'Use um código de moeda de 3 letras',
    percentRange: 'Informe de {{min}} a {{max}}',
    priorityRange: 'Escolha de {{min}} a {{max}}',
    categoryRequired: 'Escolha uma categoria',
    accountRequired: 'Escolha uma conta',
    fromAccountRequired: 'Escolha de onde o dinheiro sai',
    toAccountRequired: 'Escolha para onde o dinheiro vai',
    differentAccounts: 'Escolha duas contas diferentes',
    atLeastOneLine: 'Adicione ao menos uma linha de categoria',
    maxBudgetLines: 'No máximo {{max}} linhas de categoria',
    maxTags: 'No máximo {{max}} etiquetas',
    emailRequired: 'O e-mail é obrigatório',
    emailInvalid: 'Informe um e-mail válido',
    urlInvalid: 'Informe uma URL válida',
    urlProtocol: 'Deve ser um link seguro (https://)',
    uuidInvalid: 'Identificador inválido',
    uuidList: 'Informe uma lista de identificadores separados por vírgula',
    passwordRequired: 'A senha é obrigatória',
    passwordLength: 'A senha precisa ter ao menos {{min}} caracteres',
    passwordComplexity: 'A senha precisa ter letras e números',
    passwordsDiffer: 'As senhas não coincidem',
    confirmPassword: 'Confirme sua senha',
    confirmNewPassword: 'Confirme a nova senha',
    currentPasswordRequired: 'Informe sua senha atual',
    languageRequired: 'Escolha um idioma',
  },
  es: {
    required: 'Obligatorio',
    nameRequired: 'El nombre es obligatorio',
    descriptionRequired: 'La descripción es obligatoria',
    dateRequired: 'La fecha es obligatoria',
    dateInvalid: 'Indica una fecha válida',
    dateRangeOrder: 'La fecha de inicio debe ser igual o anterior a la fecha de fin',
    startDateRequired: 'La fecha de inicio es obligatoria',
    endDateRequired: 'La fecha de fin es obligatoria en un periodo personalizado',
    monthRequired: 'Elige un mes',
    weekdayRequired: 'Elige al menos un día de la semana',
    dayOfMonth: 'Indica un día entre {{min}} y {{max}}',
    intervalRequired: 'Indica cuántos días hay entre repeticiones',
    intervalRange: 'Indica un intervalo de {{min}} a {{max}} días',
    occurrenceLimitRange: 'Indica un número de repeticiones de {{min}} a {{max}}',
    leadTimeRange: 'Indica un número entero de días, de {{min}} a {{max}}',
    amountRequired: 'El importe es obligatorio',
    amountPositive: 'Indica un importe mayor que cero',
    decimalAmount: 'Indica un importe decimal con hasta {{decimals}} decimales',
    currencyCode: 'Usa un código de moneda de 3 letras',
    percentRange: 'Indica de {{min}} a {{max}}',
    priorityRange: 'Elige de {{min}} a {{max}}',
    categoryRequired: 'Elige una categoría',
    accountRequired: 'Elige una cuenta',
    fromAccountRequired: 'Elige de dónde sale el dinero',
    toAccountRequired: 'Elige a dónde llega el dinero',
    differentAccounts: 'Elige dos cuentas distintas',
    atLeastOneLine: 'Añade al menos una línea de categoría',
    maxBudgetLines: 'Como máximo {{max}} líneas de categoría',
    maxTags: 'Como máximo {{max}} etiquetas',
    emailRequired: 'El correo es obligatorio',
    emailInvalid: 'Indica un correo válido',
    urlInvalid: 'Indica una URL válida',
    urlProtocol: 'Debe ser un enlace seguro (https://)',
    uuidInvalid: 'Identificador no válido',
    uuidList: 'Indica una lista de identificadores separados por comas',
    passwordRequired: 'La contraseña es obligatoria',
    passwordLength: 'La contraseña necesita al menos {{min}} caracteres',
    passwordComplexity: 'La contraseña necesita letras y números',
    passwordsDiffer: 'Las contraseñas no coinciden',
    confirmPassword: 'Confirma tu contraseña',
    confirmNewPassword: 'Confirma la nueva contraseña',
    currentPasswordRequired: 'Indica tu contraseña actual',
    languageRequired: 'Elige un idioma',
  },
};

/**
 * The block to merge into an i18next catalogue, e.g.
 * `{ ...catalogue, ...validationResources('pt-BR') }`.
 */
export function validationResources(
  locale: ValidationLocale,
): Record<string, Record<ValidationMessageName, string>> {
  return { [VALIDATION_NAMESPACE]: VALIDATION_MESSAGES[locale] };
}

/** Traduções PT do módulo "auth" (fonte). */
const auth = {
  login: {
    title: "Entrar",
    subtitle: "Aceda à gestão da sua clínica.",
    heroTitle: "O pulso da sua clínica, em tempo real.",
    heroBody:
      "Marcações, ocupação médica, receitas, stock e recebimentos — uma só plataforma, pensada para clínicas em Moçambique.",
    email: "Email",
    emailPlaceholder: "voce@clinica.mz",
    password: "Palavra-passe",
    forgotPassword: "Esqueci a palavra-passe",
    submit: "Entrar",
    demoTitle: "Contas de demonstração",
    demoPassword: "Palavra-passe:",
  },
  reset: {
    title: "Recuperar palavra-passe",
    description: "Receba um código de confirmação no email associado à conta.",
    doneTitle: "Palavra-passe atualizada",
    doneBody: "Já pode entrar com a nova palavra-passe.",
    backToLogin: "Voltar ao login",
    codeSent: "Se o endereço estiver registado, enviámos um código para {email}.",
    code: "Código de confirmação",
    newPassword: "Nova palavra-passe",
    confirmPassword: "Confirmar palavra-passe",
    confirmSubmit: "Confirmar e alterar",
    otherEmail: "Usar outro email",
    accountEmail: "Email da conta",
    sendCode: "Enviar código",
  },
  errors: {
    invalidEmail: "Email inválido",
    passwordRequired: "Introduza a palavra-passe",
    invalidCredentials: "Credenciais inválidas.",
    tooManyAttempts: "Demasiadas tentativas. Tente novamente dentro de {minutes} minuto(s).",
    enterValidEmail: "Introduza um email válido.",
    codeFormat: "O código deve ter 6 dígitos.",
    passwordLength: "A palavra-passe deve ter pelo menos 8 caracteres.",
    passwordMismatch: "As palavras-passe não coincidem.",
    sendFailed: "Não foi possível enviar o email. Tente novamente dentro de alguns minutos.",
    codeInvalidOrExpired: "Código inválido ou expirado.",
    codeInvalidOrExpiredRetry: "Código inválido ou expirado. Peça um novo código.",
    codeInvalidRemaining: "Código inválido. Restam {remaining} tentativas.",
    codeBlocked: "Código bloqueado. Peça um novo código.",
  },
};

export default auth;

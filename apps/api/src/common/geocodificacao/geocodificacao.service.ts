import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

// Campos de endereço suficientes pra montar uma consulta de geocodificação —
// mesmo shape dos campos separados de endereço em Salão/Usuario (ver
// common/endereco.util.ts).
interface EnderecoParaGeocodificar {
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
}

interface Coordenadas {
  latitude: number;
  longitude: number;
}

// Geocodifica o endereço de um salão usando o Nominatim (OpenStreetMap)
// — serviço gratuito e sem chave de API, mesma fonte de mapa que o app já usa
// (Leaflet + tiles do OpenStreetMap em MapScreen), então não introduz conta
// nem custo novo no projeto. Usado só como QUEDA (fallback): o dono
// capturando o GPS em "Mais > Localização" continua sendo a fonte preferida e
// mais precisa — ver Salao.latitude/longitude vs.
// enderecoLatitude/enderecoLongitude no schema, e
// SaloesService.listarProximas/comCoordenadasPublicas, que decide qual
// das duas devolver pro app.
//
// Uso responsável da API pública do Nominatim (política oficial do projeto
// OSM): no máximo 1 requisição por segundo e um User-Agent identificando a
// aplicação — ver https://operations.osmfoundation.org/policies/nominatim/.
// Como isso só roda quando um endereço é criado/alterado (ou, na pior das
// hipóteses, uma vez por salão antiga sem cache ainda — ver
// resolverCoordenadas), o volume é baixíssimo e nunca deve chegar perto desse
// limite; o pequeno atraso artificial abaixo (respeitarLimiteDeTaxa) é só uma
// rede de segurança caso vários salões precisem ser geocodificadas na
// mesma leitura (ex.: logo após essa feature ir ao ar).
@Injectable()
export class GeocodificacaoService {
  private readonly logger = new Logger(GeocodificacaoService.name);
  private proximaChamadaLiberadaEm = 0;

  constructor(private prisma: PrismaService) {}

  // Geocodifica e GRAVA o resultado em enderecoLatitude/enderecoLongitude da
  // salão — chamado logo depois de criar/atualizar o endereço (ver
  // AuthService.registerSalao e SaloesService.atualizar), pra deixar
  // o cache pronto em vez de esperar a primeira leitura pra calcular. Nunca
  // lança erro: endereço não encontrado ou Nominatim fora do ar não pode
  // quebrar o cadastro/edição do salão — só fica sem o fallback por
  // enquanto (a próxima leitura tenta de novo, via resolverCoordenadas).
  async geocodificarEAtualizar(salaoId: string, endereco: EnderecoParaGeocodificar): Promise<void> {
    const coordenadas = await this.geocodificar(endereco);
    if (!coordenadas) return;
    await this.prisma.salao
      .update({
        where: { id: salaoId },
        data: { enderecoLatitude: coordenadas.latitude, enderecoLongitude: coordenadas.longitude },
      })
      .catch((erro) => this.logger.warn(`Não foi possível gravar o cache de geocodificação de ${salaoId}: ${erro.message}`));
  }

  // Rede de segurança pra salões que já existiam antes dessa feature
  // (sem GPS e sem cache ainda): geocodifica na hora e já grava o cache, pra
  // só a primeira leitura pagar o custo da chamada ao Nominatim. Devolve
  // `null` quando falta endereço suficiente ou a geocodificação falha (nesse
  // caso o salão simplesmente continua de fora do mapa, como já era).
  async resolverCoordenadas(
    salao: { id: string; enderecoLatitude: number | null; enderecoLongitude: number | null } & EnderecoParaGeocodificar,
  ): Promise<Coordenadas | null> {
    if (salao.enderecoLatitude != null && salao.enderecoLongitude != null) {
      return { latitude: salao.enderecoLatitude, longitude: salao.enderecoLongitude };
    }

    const coordenadas = await this.geocodificar(salao);
    if (!coordenadas) return null;

    await this.prisma.salao
      .update({
        where: { id: salao.id },
        data: { enderecoLatitude: coordenadas.latitude, enderecoLongitude: coordenadas.longitude },
      })
      .catch(() => {}); // é só um cache — se não gravar agora, tenta de novo na próxima leitura
    return coordenadas;
  }

  private async geocodificar(endereco: EnderecoParaGeocodificar): Promise<Coordenadas | null> {
    if (!endereco.cidade || !endereco.uf) return null; // endereço incompleto demais pra arriscar um resultado errado

    const partes = [
      endereco.logradouro && endereco.numero ? `${endereco.logradouro}, ${endereco.numero}` : endereco.logradouro,
      endereco.bairro,
      endereco.cidade,
      endereco.uf,
      "Brasil",
    ].filter(Boolean);
    const consulta = partes.join(", ");

    await this.respeitarLimiteDeTaxa();

    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(consulta)}`;
      const resposta = await fetch(url, {
        // Exigido pela política de uso do Nominatim — identifica a aplicação
        // que está chamando (não precisa ser um e-mail de verdade monitorado,
        // só algo que identifique o app em caso de abuso).
        headers: { "User-Agent": "ElevaOneApp/1.0 (+https://elevaone.store; contato: divisionstech@gmail.com)" },
      });
      if (!resposta.ok) {
        this.logger.warn(`Nominatim respondeu ${resposta.status} para "${consulta}"`);
        return null;
      }
      const resultados = (await resposta.json()) as Array<{ lat: string; lon: string }>;
      if (resultados.length === 0) {
        this.logger.warn(`Nenhum resultado de geocodificação para "${consulta}"`);
        return null;
      }
      const latitude = Number(resultados[0].lat);
      const longitude = Number(resultados[0].lon);
      if (Number.isNaN(latitude) || Number.isNaN(longitude)) return null;
      return { latitude, longitude };
    } catch (erro) {
      this.logger.warn(`Falha ao geocodificar "${consulta}": ${(erro as Error).message}`);
      return null;
    }
  }

  // Garante pelo menos 1.1s entre duas chamadas ao Nominatim, mesmo se vários
  // "resolverCoordenadas" caírem juntos (ex.: vários salões sem cache na
  // mesma listagem) — ver aviso de uso responsável no comentário da classe.
  private async respeitarLimiteDeTaxa(): Promise<void> {
    const agora = Date.now();
    const espera = this.proximaChamadaLiberadaEm - agora;
    this.proximaChamadaLiberadaEm = Math.max(agora, this.proximaChamadaLiberadaEm) + 1100;
    if (espera > 0) await new Promise((resolve) => setTimeout(resolve, espera));
  }
}

# Palabras clave en ingles (Gherkin), texto de los pasos en espanol.
Feature: Buscar productos en el catalogo
  Como cliente de la tienda
  quiero buscar productos por nombre
  para encontrar un producto especifico

  @catalogo
  Scenario: Mostrar estado vacio cuando la busqueda no tiene coincidencias
    Given que abro la home de la tienda
    When busco el producto "zz-no-existe-qa-8472"
    Then no veo productos en el catalogo
    And veo el mensaje "No hay productos para ese filtro."